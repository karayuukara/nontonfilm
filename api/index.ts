import STATIC_MOVIES from "../src/data/static-movies";
import { Hono } from "hono";

const app = new Hono();

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
  popularity?: number;
}

// In-memory cache
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

// TMDB website scraper (no API key needed)
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

async function scrapeMovieDetail(tmdbId: number): Promise<Movie | null> {
  try {
    const url = `${TMDb_BASE}/movie/${tmdbId}`;
    const html = await fetchHTML(url);

    const ldMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldMatch) return null;

    let ld: any = null;
    for (const m of ldMatch) {
      const json = m.replace(/<script\s+type="application\/ld\+json"[^>]*>/, "").replace(/<\/script>/, "");
      try {
        const data = JSON.parse(json);
        if (data["@type"] === "Movie") { ld = data; break; }
      } catch {}
    }
    if (!ld) return null;

    const posterMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/([^"']+)/);
    const backdropMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/original\/([^"']+)/);

    const genreMatches = html.matchAll(/<a\s+href="\/genre\/\d+[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres: string[] = [];
    for (const gm of genreMatches) genres.push(gm[1].trim());

    const runtimeMatch = html.match(/(\d+)h\s*(\d+)m/);
    const runtime = runtimeMatch ? parseInt(runtimeMatch[1]) * 60 + parseInt(runtimeMatch[2]) : 0;
    const taglineMatch = html.match(/<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i);
    const tagline = taglineMatch ? taglineMatch[1].trim() : "";

    return {
      id: tmdbId,
      title: ld.name || "Unknown",
      overview: ld.description || "",
      poster_path: posterMatch ? "/" + posterMatch[1] : null,
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

function getStaticMovies(): Movie[] {
  return STATIC_MOVIES as Movie[];
}

// Search
app.get("/api/movies/search", async (c) => {
  const query = c.req.query("query") || "";
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length < 2) {
    return c.json({ results: [], total_pages: 0, total_results: 0 });
  }

  const cacheKey = `search:${normalizedQuery}`;
  const hit = cached(cacheKey);
  if (hit) return c.json(hit);

  const all = getStaticMovies();
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

  setCache(cacheKey, data);
  return c.json(data);
});

// Movie detail
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

  const staticMovies = getStaticMovies();
  const found = staticMovies.find(m => m.id === id);
  if (found) return c.json(found);

  return c.json({ error: "Movie not found" }, 404);
});

// Popular
app.get("/api/movies/popular", async (c) => {
  const hit = cached("popular");
  if (hit) return c.json(hit);

  try {
    const movies = await scrapePopularMovies();
    setCache("popular", movies);
    return c.json(movies);
  } catch {
    return c.json(getStaticMovies());
  }
});

// Static fallback
app.get("/api/movies/static", async (c) => {
  return c.json(getStaticMovies());
});

// ═══════════════════════════════════════════════════════════════
// Embed Proxy — bypasses 2Embed/VidSrc iframe detection
// ═══════════════════════════════════════════════════════════════
const PROXY_REWRITE_HOSTS = [
  "vidsrc.to", "www.2embed.cc", "2embed.cc", "vidsrc.cc",
  "vidcloud.xyz", "vidstream.pro", "streamtape.com",
];

async function proxyEmbed(url: string, c: any): Promise<Response> {
  const target = new URL(url);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  const contentType = res.headers.get("content-type") || "";

  if (contentType.includes("text/html")) {
    let body = await res.text();
    const proxyBase = `${new URL(c.req.url).origin}/api/proxy?url=`;

    // Rewrite absolute URLs pointing to known hosts
    for (const host of PROXY_REWRITE_HOSTS) {
      const pattern = new RegExp(`https?://(?:[^/]*\\.)?${host.replace(/\./g, "\\.")}`, "gi");
      body = body.replace(pattern, (match: string) => {
        const u = new URL(match);
        u.searchParams.set("_from_proxy", "1");
        return `${proxyBase}${encodeURIComponent(u.toString())}`;
      });
    }

    // Rewrite relative URLs (src="/...", href="/...", action="/...")
    body = body.replace(
      /(src|href|action)=["'](\/[^"']*)["']/gi,
      (_m: string, attr: string, path: string) => {
        const abs = new URL(path, target.origin).toString();
        return `${attr}="${proxyBase}${encodeURIComponent(abs)}"`;
      }
    );

    // Patch window.top / window.parent to prevent iframe detection
    body = body.replace(
      /<\/head>/i,
      `<script>Object.defineProperty(window,'top',{get:()=>window});Object.defineProperty(window,'parent',{get:()=>window});Object.defineProperty(window,'frameElement',{get:()=>null});<\/script></head>`
    );

    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }

  // For non-HTML (JS, CSS, images, etc.) — pass through
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

app.get("/api/proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url required" }, 400);

  try {
    return await proxyEmbed(url, c);
  } catch (err: any) {
    return c.json({ error: err.message || "proxy failed" }, 502);
  }
});

export default app;
