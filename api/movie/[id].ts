import { Hono } from "hono";
import { handle } from "hono/vercel";
import {
  STATIC_MOVIES, cache, CACHE_TTL,
  cached, setCache, scrapeMovieDetail
} from "./_utils";

const app = new Hono();

app.get("/api/movie/:id", async (c) => {
  const id = parseInt(c.req.param("id"));
  if (isNaN(id)) return c.json({ error: "Invalid ID" }, 400);

  const ck = `movie:${id}`;
  const hit = cached(ck);
  if (hit) return c.json(hit);

  try { const detail = await scrapeMovieDetail(id); if (detail) { setCache(ck, detail); return c.json(detail); } } catch {}
  const found = STATIC_MOVIES.find((m: any) => m.id === id);
  if (found) return c.json(found);
  return c.json({ error: "Not found" }, 404);
});

export default handle(app);
