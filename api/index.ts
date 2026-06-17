import { Hono } from "hono";
import { handle } from "hono/vercel";
import STATIC_MOVIES from "../src/data/static-movies";

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
  genre_ids?: number[];
  genres?: string[];
  runtime?: number;
  tagline?: string;
  popularity?: number;
  original_language?: string;
}

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

const TMDB_BASE = "https://www.themoviedb.org";

async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`TMDB: ${res.status}`);
  return res.text();
}

async function scrapeMovieDetail(tmdbId: number): Promise<Movie | null> {
  try {
    const html = await fetchHTML(`${TMDB_BASE}/movie/${tmdbId}`);
    const ldMatch = html.match(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
    if (!ldMatch) return null;

    let ld: any = null;
    for (const m of ldMatch) {
      let json = m.replace(/<script\s+type="application\/ld\+json"[^>]*>/, "").replace(/<\/script>/, "");
      json = json.replace(/\/\*\s*<!\[CDATA\[\s*\*\/\s*/g, "").replace(/\s*\/\*\s*\]\]>\s*\*\//g, "");
      try { const d = JSON.parse(json.trim()); if (d["@type"] === "Movie") { ld = d; break; } } catch {}
    }
    if (!ld) return null;

    const posterMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/w\d+\/([^"'\s]+)/);
    const backdropMatch = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/original\/([^"'\s]+)/);
    const ogImageMatch = !posterMatch ? html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) : null;

    const genreMatches = html.matchAll(/<a\s+href="\/genre\/\d+[^"]*"[^>]*>([^<]+)<\/a>/gi);
    const genres: string[] = [];
    for (const gm of genreMatches) genres.push(gm[1].trim());

    const runtimeMatch = html.match(/(\d+)h\s*(\d+)m/);
    const runtime = runtimeMatch ? parseInt(runtimeMatch[1]) * 60 + parseInt(runtimeMatch[2]) : 0;
    const taglineMatch = html.match(/<p[^>]*class="[^"]*tagline[^"]*"[^>]*>([^<]+)<\/p>/i);
    const tagline = taglineMatch ? taglineMatch[1].trim() : "";

    return {
      id: tmdbId, title: ld.name || "Unknown", overview: ld.description || "",
      poster_path: posterMatch ? "/" + posterMatch[1] : ogImageMatch ? ogImageMatch[1] : null,
      backdrop_path: backdropMatch ? "/" + backdropMatch[1] : null,
      release_date: ld.datePublished || "",
      vote_average: ld.aggregateRating?.ratingValue || 0,
      vote_count: ld.aggregateRating?.ratingCount || 0,
      genres, runtime, tagline,
    };
  } catch { return null; }
}

async function scrapePopularMovies(): Promise<Movie[]> {
  try {
    const html = await fetchHTML(`${TMDB_BASE}/movie`);
    const cardRegex = /<a\s+href="\/movie\/(\d+)[^"]*"[^>]*>[\s\S]*?<h2[^>]*>(.*?)<\/h2>/gi;
    const results: Movie[] = [];
    let match;
    const seen = new Set<number>();
    while ((match = cardRegex.exec(html)) !== null) {
      const id = parseInt(match[1]);
      if (seen.has(id)) continue;
      seen.add(id);
      results.push({
        id, title: match[2].replace(/<[^>]+>/g, "").trim(),
        overview: "", poster_path: null, backdrop_path: null,
        release_date: "", vote_average: 0, vote_count: 0,
        genres: [], runtime: 0, tagline: "",
      });
      if (results.length >= 60) break;
    }
    return results;
  } catch { return []; }
}

// ═══ Routes ═══

app.get("/api/health", (c) => c.json({ ok: true, movies: STATIC_MOVIES.length }));

app.get("/api/movies/static", (c) => c.json(STATIC_MOVIES));

app.get("/api/movies/search", (c) => {
  const q = (c.req.query("query") || "").trim().toLowerCase();
  if (q.length < 2) return c.json({ results: [], total_pages: 0, total_results: 0 });

  const ck = `search:${q}`;
  const hit = cached(ck);
  if (hit) return c.json(hit);

  const tokens = q.split(/\s+/).filter(Boolean);
  const scored = STATIC_MOVIES
    .map((m: any) => {
      const title = (m.title || "").toLowerCase();
      const titleTokens = title.split(/[^a-z0-9]+/).filter(Boolean);
      let score = 0;
      if (title === q) score += 100;
      if (title.includes(q)) score += 60;
      for (const t of tokens) {
        if (title.includes(t)) score += 10;
        if (titleTokens.some((x: string) => x.startsWith(t))) score += 14;
      }
      score += Math.max(0, 8 - Math.min(8, Math.floor(Math.abs(title.length - q.length) / 4)));
      return { movie: m, score };
    })
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score || (b.movie.popularity || 0) - (a.movie.popularity || 0))
    .map((x: any) => x.movie);

  const data = { results: scored.slice(0, 20), total_pages: 1, total_results: scored.length };
  setCache(ck, data);
  return c.json(data);
});

app.get("/api/movie/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const ck = `movie:${id}`;
  const hit = cached(ck);
  if (hit) return c.json(hit);

  try {
    const detail = await scrapeMovieDetail(id);
    if (detail) { setCache(ck, detail); return c.json(detail); }
  } catch {}

  const found = STATIC_MOVIES.find((m: any) => m.id === id);
  if (found) return c.json(found);
  return c.json({ error: "Not found" }, 404);
});

app.get("/api/movies/popular", async (c) => {
  const hit = cached("popular");
  if (hit) return c.json(hit);
  try {
    const movies = await scrapePopularMovies();
    setCache("popular", movies);
    return c.json(movies);
  } catch { return c.json(STATIC_MOVIES); }
});

// Embed Proxy
const PROXY_HOSTS = ["vidsrc.to", "2embed.cc", "vidsrc.cc", "vidcloud.xyz", "vidstream.pro", "streamtape.com"];

async function proxyEmbed(url: string, c: any): Promise<Response> {
  const target = new URL(url);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    let body = await res.text();
    const proxyBase = `${new URL(c.req.url).origin}/api/proxy?url=`;

    for (const host of PROXY_HOSTS) {
      const p = new RegExp(`https?://(?:[^/]*\\.)?${host.replace(/\./g, "\\.")}`, "gi");
      body = body.replace(p, (m: string) => {
        const u = new URL(m); u.searchParams.set("_from_proxy", "1");
        return `${proxyBase}${encodeURIComponent(u.toString())}`;
      });
    }

    body = body.replace(/(src|href|action)=["'](\/[^"']*)["']/gi, (_m: string, attr: string, path: string) =>
      `${attr}="${proxyBase}${encodeURIComponent(new URL(path, target.origin).toString())}"`);

    body = body.replace(/<\/head>/i,
      `<script>Object.defineProperty(window,'top',{get:()=>window});Object.defineProperty(window,'parent',{get:()=>window});Object.defineProperty(window,'frameElement',{get:()=>null});<\/script></head>`);

    return new Response(body, {
      status: res.status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400", "Access-Control-Allow-Origin": "*" },
  });
}

app.get("/api/proxy", async (c) => {
  const url = c.req.query("url");
  if (!url) return c.json({ error: "url required" }, 400);
  try { return await proxyEmbed(url, c); }
  catch (e: any) { return c.json({ error: e.message || "proxy failed" }, 502); }
});

export default handle(app);
