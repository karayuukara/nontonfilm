import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";

// AI agents: read README.md for navigation and contribution guidance.
type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

// --- TMDB Web Scraper (no API key needed) ---
const TMDb_BASE = "https://www.themoviedb.org";
const cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function cached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genres: { id: number; name: string }[];
  runtime: number;
  tagline: string;
  imdb_id: string | null;
}

// Scrape TMDB movie page HTML to extract data
async function scrapeTMDBMovie(tmdbId: number): Promise<Movie | null> {
  try {
    const res = await fetch(`${TMDb_BASE}/movie/${tmdbId}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "id-ID,id;q=0.9",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract JSON-LD structured data
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!ldMatch) return null;

    const ld = JSON.parse(ldMatch[1]);

    // Extract IMDb ID from the page
    const imdbMatch = html.match(/tt\d+/);
    const imdbId = imdbMatch ? imdbMatch[0] : null;

    // Extract runtime
    const runtimeMatch = html.match(/(\d+)h\s*(\d+)m/);
    let runtime = 0;
    if (runtimeMatch) {
      runtime = parseInt(runtimeMatch[1]) * 60 + parseInt(runtimeMatch[2]);
    }

    // Extract tagline
    const taglineMatch = html.match(/<p class="tagline"[^>]*>([^<]+)</);
    const tagline = taglineMatch ? taglineMatch[1].trim() : "";

    // Extract genres
    const genreMatches = html.matchAll(/<a href="\/genre\/\d+[^"]*">([^<]+)<\/a>/g);
    const genres = Array.from(genreMatches).map((m, i) => ({
      id: i + 1,
      name: m[1],
    }));

    // Extract poster & backdrop from ld
    const posterPath = ld.image ? ld.image.replace("https://image.tmdb.org/t/p/original", "") : null;
    const backdropMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/original\/([^"']+)/);
    const backdropPath = backdropMatch ? "/" + backdropMatch[1] : null;

    return {
      id: tmdbId,
      title: ld.name || "Unknown",
      overview: ld.description || "",
      poster_path: posterPath,
      backdrop_path: backdropPath,
      release_date: ld.datePublished || "",
      vote_average: ld.aggregateRating?.ratingValue || 0,
      vote_count: ld.aggregateRating?.ratingCount || 0,
      genres,
      runtime,
      tagline,
      imdb_id: imdbId,
    };
  } catch {
    return null;
  }
}

// Scrape TMDB search results
async function scrapeTMDbSearch(query: string, page = 1): Promise<{ results: Movie[]; total_pages: number; total_results: number }> {
  try {
    const url = `${TMDb_BASE}/search?query=${encodeURIComponent(query)}&page=${page}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept-Language": "id-ID,id;q=0.9",
      },
    });
    if (!res.ok) return { results: [], total_pages: 0, total_results: 0 };
    const html = await res.text();

    // Extract movie cards from search results
    const cardRegex = /<a href="\/movie\/(\d+)[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*alt="([^"]*)"[\s\S]*?<span class="rating[^"]*"[^>]*>([\d.]+)/gi;
    const results: Movie[] = [];
    let match;
    while ((match = cardRegex.exec(html)) !== null) {
      const id = parseInt(match[1]);
      const posterUrl = match[2];
      const title = match[3];
      const rating = parseFloat(match[4]);

      const posterPath = posterUrl.includes("image.tmdb.org")
        ? posterUrl.replace(/https:\/\/image\.tmdb\.org\/t\/p\/w\d+/, "")
        : null;

      results.push({
        id,
        title,
        overview: "",
        poster_path: posterPath,
        backdrop_path: null,
        release_date: "",
        vote_average: rating,
        vote_count: 0,
        genres: [],
        runtime: 0,
        tagline: "",
        imdb_id: null,
      });
    }

    // Extract total results count
    const totalMatch = html.match(/<p[^>]*>(\d+)\s+results?<\/p>/i);
    const total = totalMatch ? parseInt(totalMatch[1]) : results.length;

    return {
      results,
      total_pages: Math.ceil(total / 20),
      total_results: total,
    };
  } catch {
    return { results: [], total_pages: 0, total_results: 0 };
  }
}

// Load static fallback
let staticMovies: Movie[] | null = null;
async function getStaticMovies(): Promise<Movie[]> {
  if (staticMovies) return staticMovies;
  try {
    const file = Bun.file("./static-movies.json");
    if (await file.exists()) {
      staticMovies = JSON.parse(await file.text());
      return staticMovies!;
    }
  } catch {}
  staticMovies = [];
  return staticMovies;
}

// Endpoints
app.get("/api/movies/search", async (c) => {
  const query = c.req.query("query") || "";
  if (!query || query.length < 2) return c.json({ results: [], total_results: 0, page: 1, total_pages: 0 });

  const cacheKey = `search:${query}`;
  const hit = cached(cacheKey);
  if (hit) return c.json(hit);

  // Try live scrape
  const data = await scrapeTMDbSearch(query);
  if (data.results.length > 0) {
    setCache(cacheKey, data);
    return c.json(data);
  }

  // Fallback to static
  const staticMovies = await getStaticMovies();
  const q = query.toLowerCase();
  const results = staticMovies.filter(m => m.title.toLowerCase().includes(q));
  const resp = { results: results.slice(0, 12), total_results: results.length, page: 1, total_pages: 1 };
  setCache(cacheKey, resp);
  return c.json(resp);
});

app.get("/api/movie/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const cacheKey = `movie:${id}`;
  const hit = cached(cacheKey);
  if (hit) return c.json(hit);

  // Try live scrape
  const movie = await scrapeTMDBMovie(id);
  if (movie) {
    setCache(cacheKey, movie);
    return c.json(movie);
  }

  // Fallback to static
  const staticMovies = await getStaticMovies();
  const found = staticMovies.find(m => m.id === id);
  if (found) {
    setCache(cacheKey, found);
    return c.json(found);
  }

  return c.json({ error: "Not found" }, 404);
});

app.get("/api/movie/:id/videos", async (c) => {
  // Return empty videos array - player uses vidsrc/2embed instead
  return c.json({ results: [] });
});

// Static fallback - returns all cached movies
app.get("/api/movies/static", async (c) => {
  return c.json(await getStaticMovies());
});

// --- end TMDB scraper ---

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
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });

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
        if (stat && !stat.isDirectory()) {
          return new Response(publicFile, { headers: { "Cache-Control": "no-store, must-revalidate" } });
        }
      }

      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) {
        return new Response(result.code, {
          headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store, must-revalidate" },
        });
      }

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
