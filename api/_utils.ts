import { Hono } from "hono";
import { handle } from "hono/vercel";
import STATIC_MOVIES from "../src/data/static-movies";

export const cache = new Map<string, { data: unknown; ts: number }>();
export const CACHE_TTL = 60 * 60 * 1000;

export function cached(key: string) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

export function setCache(key: string, data: unknown) {
  cache.set(key, { data, ts: Date.now() });
}

export const TMDB_BASE = "https://www.themoviedb.org";

export async function fetchHTML(url: string): Promise<string> {
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

export interface Movie {
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

export async function scrapeMovieDetail(tmdbId: number): Promise<Movie | null> {
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

export async function scrapePopularMovies(): Promise<Movie[]> {
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

export const PROXY_HOSTS = ["vidsrc.to", "2embed.cc", "vidsrc.cc", "vidcloud.xyz", "vidstream.pro", "streamtape.com"];

export async function proxyEmbed(url: string, origin: string): Promise<Response> {
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
    const proxyBase = `${origin}/api/proxy?url=`;

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

export { STATIC_MOVIES };
