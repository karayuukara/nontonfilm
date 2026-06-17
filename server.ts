import STATIC_MOVIES from './src/data/static-movies';
import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";

type Mode = "development" | "production";
const app = new Hono();
const mode: Mode = process.env.NODE_ENV === "production" ? "production" : "development";

// === Movie type ===
interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genres: string[];
  runtime: number;
  tagline: string;
}

// === In-memory cache ===
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function cached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

// === TMDB website scraper (no API key needed) ===
const TMDb_BASE = "https://www.themoviedb.org";

async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.text();
}

// Scrape TMDB search results page
async function scrapeTMDbSearch(query: string, page = 1): Promise<{ results: Movie[]; total_pages: number; total_results: number }> {
  try {
    const url = `${TMDb_BASE}/search/movie?query=${encodeURIComponent(query)}&page=${page}`;
    const html = await fetchHTML(url);

    // Extract movie cards: <a href="/movie/<id>-slug"><h2>Title</h2>...
    const cardRegex = /<a\s+href="\/movie\/(\d+)[^"]*"[^>]*>[\s\S]*?<h2[^>]*>(.*?)<\/h2>/gi;
    const results: Movie[] = [];
    let match;
    const seen = new Set<number>();

    while ((match = cardRegex.exec(html)) !== null) {
      const id = parseInt(match[1]);
      if (seen.has(id)) continue;
      seen.add(id);

      const title = match[2].replace(/<[^>]+>/g, "").trim();
      results.push({
        id,
        title,
        overview: "",
        poster_path: null,
        backdrop_path: null,
        release_date: "",
        vote_average: 0,
        vote_count: 0,
        genres: [],
        runtime: 0,
        tagline: "",
      });
    }

    // Count total results from pagination
    const totalMatch = html.match(/of\s+([\d,]+)\s+results/i);
    const total = totalMatch ? parseInt(totalMatch[1].replace(/,/g, "")) : results.length;

    return { results, total_pages: Math.ceil(total / 20), total_results: total };
  } catch {
    return { results: [], total_pages: 0, total_results: 0 };
  }
}

// Scrape movie detail page
async function scrapeMovieDetail(tmdbId: number): Promise<Movie | null> {
  try {
    const url = `${TMDb_BASE}/movie/${tmdbId}`;
    const html = await fetchHTML(url);

    // Extract JSON-LD structured data
    const ldMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldMatch) return null;

    let ld: any = null;
    for (const m of ldMatch) {
      let json = m.replace(/<script\s+type=\"application\/ld\+json\"[^>]*>/, "").replace(/<\/script>/, "");
      // Strip CDATA wrapper that TMDB adds: /* <![CDATA[ */ ... */
      json = json.replace(/\/\*\s*<!\[CDATA\[\s*\*\/\s*/g, "").replace(/\s*\/\*\s*\]\]>\s*\*\//g, "");
      try {
        const data = JSON.parse(json.trim());
        if (data["@type"] === "Movie") { ld = data; break; }
      } catch {}
    }
    if (!ld) return null;

    // Extract poster & backdrop from page
    const posterMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/([^"'\s]+)/);
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="(https:\/\/image\.tmdb\.org\/[^"]+)"/);
    const backdropMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/original\/([^"'\s]+)/);

    // Genres
    const genreMatches = html.matchAll(/<a\s+href="\/genre\/\d+[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres: string[] = [];
    for (const gm of genreMatches) genres.push(gm[1].trim());

    // Runtime & tagline
    const runtimeMatch = html.match(/(\d+)h\s*(\d+)m/);
    const runtime = runtimeMatch ? parseInt(runtimeMatch[1]) * 60 + parseInt(runtimeMatch[2]) : 0;
    const taglineMatch = html.match(/<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i);
    const tagline = taglineMatch ? taglineMatch[1].trim() : "";

    // IMDb ID for vidsrc
    const imdbMatch = html.match(/"imdb_id":"(tt\d{7,8})"/);

    return {
      id: tmdbId,
      title: ld.name || "Unknown",
      overview: ld.description || "",
      poster_path: posterMatch ? "/" + posterMatch[1] : ogImageMatch ? ogImageMatch[1] : null,
      backdrop_path: backdropMatch ? "/" + backdropMatch[1] : null,
      release_date: ld.datePublished || "",
      vote_average: ld.aggregateRating?.ratingValue || 0,
      vote_count: ld.aggregateRating?.ratingCount || 0,
      genres,
      runtime,
      tagline,
    };
  } catch {
    return null;
  }
}

// Scrape popular/trending movies from homepage
async function scrapePopularMovies(): Promise<Movie[]> {
  try {
    const html = await fetchHTML(`${TMDb_BASE}/movie`);
    const cardRegex = /<a\s+href="\/movie\/(\d+)[^"]*"[^>]*>[\s\S]*?<h2[^>]*>(.*?)<\/h2>/gi;
    const results: Movie[] = [];
    let match;
    const seen = new Set<number>();

    while ((match = cardRegex.exec(html)) !== null) {
      const id = parseInt(match[1]);
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id,
        title: match[2].replace(/<[^>]+>/g, "").trim(),
        overview: "", poster_path: null, backdrop_path: null,
        release_date: "", vote_average: 0, vote_count: 0,
        genres: [], runtime: 0, tagline: "",
      });
      if (results.length >= 60) break;
    }
    return results;
  } catch {
    return [];
  }
}

// Static movies embedded at build time (works on Vercel)
function getStaticMovies(): Movie[] {
  return STATIC_MOVIES as Movie[];
}

// === API Routes ===

// Search - static first, fuzzy matching only
app.get("/api/movies/search", async (c) => {
  const query = c.req.query("query") || "";
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return c.json({ results: [], total_pages: 0, total_results: 0 });
  }

  const cacheKey = `search:${normalizedQuery}`;
  const hit = cached(cacheKey);
  if (hit) return c.json(hit);

  const all = await getStaticMovies();
  const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);

  const scored = all
    .map((movie) => {
      const title = (movie.title || "").toLowerCase();
      const titleTokens = title.split(/[^a-z0-9]+/).filter(Boolean);
      let score = 0;

      if (title === normalizedQuery) score += 100;
      if (title.includes(normalizedQuery)) score += 60;

      for (const token of queryTokens) {
        if (!token) continue;
        if (title.includes(token)) score += 10;
        if (titleTokens.some((t) => t.startsWith(token))) score += 14;
      }

      // small boost for close approximate title length
      const lengthDelta = Math.abs(title.length - normalizedQuery.length);
      score += Math.max(0, 8 - Math.min(8, Math.floor(lengthDelta / 4)));

      return { movie, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || (b.movie.popularity || 0) - (a.movie.popularity || 0))
    .map((item) => item.movie);

  const data = {
    results: scored.slice(0, 20),
    total_pages: 1,
    total_results: scored.length,
  };

  // If static search yields few results, also try TMDB search
  if (scored.length < 3) {
    try {
      const tmdbResults = await scrapeTMDbSearch(query);
      if (tmdbResults.results.length > 0) {
        const existingIds = new Set(scored.map(m => m.id));
        const merged = [...scored, ...tmdbResults.results.filter(r => !existingIds.has(r.id))];
        data.results = merged.slice(0, 20);
        data.total_results = merged.length;
        data.total_pages = tmdbResults.total_pages;
      }
    } catch {}
  }

  setCache(cacheKey, data);
  return c.json(data);
});

// Movie detail - scrapes TMDB live
app.get("/api/movie/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const cacheKey = `movie:${id}`;
  const hit = cached(cacheKey);
  if (hit) return c.json(hit);

  try {
    const detail = await scrapeMovieDetail(id);
    if (detail) {
      setCache(cacheKey, detail);
      return c.json(detail);
    }
  } catch {}

  // Fallback
  const staticMovies = await getStaticMovies();
  const found = staticMovies.find(m => m.id === id);
  if (found) return c.json(found);

  return c.json({ error: "Movie not found" }, 404);
});

// Browse / discover
app.get("/api/movies/popular", async (c) => {
  const hit = cached("popular");
  if (hit) return c.json(hit);

  try {
    const movies = await scrapePopularMovies();
    setCache("popular", movies);
    return c.json(movies);
  } catch {
    const s = await getStaticMovies();
    return c.json(s);
  }
});

// Static fallback (always available)
app.get("/api/movies/static", async (c) => {
  const movies = await getStaticMovies();
  return c.json(movies);
});

// === Proxy for embed video servers ===
app.get("/api/proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "Missing url param" }, 400);

  try {
    const parsed = new URL(url);
    const allowedHosts = [
      "vidsrc.to", "www.2embed.cc", "vidsrc.cc",
      "vidlink.pro", "moviesapi.club", "2embed.org",
      "embed.su", "vidsrc.xyz", "vidsrc.me",
    ];
    if (!allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith("." + h))) {
      return c.json({ error: "Host not allowed" }, 403);
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": parsed.origin,
        "Origin": parsed.origin,
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") || "text/html";
    const headers = new Headers();
    headers.set("Content-Type", contentType);
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("X-Frame-Options", "ALLOWALL");

    const body = await response.arrayBuffer();
    return new Response(body, { status: response.status, headers });
  } catch (err: any) {
    return c.json({ error: "Proxy error", detail: err.message }, 502);
  }
});

// === Production / Development routing ===
if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

const port = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();
    const file = Bun.file(`./dist${path}`);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat && !stat.isDirectory()) return new Response(file);
    }
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);
    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      const publicFile = Bun.file(`./public${url}`);
      if (await publicFile.exists()) {
        const stat = await publicFile.stat();
        if (stat && !stat.isDirectory()) return new Response(publicFile, { headers: { "Cache-Control": "no-store, must-revalidate" } });
      }
      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) return new Response(result.code, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store, must-revalidate" } });
      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template, { headers: { "Cache-Control": "no-store, must-revalidate" } });
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });
  return vite;
}
