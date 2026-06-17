export default function handler(req: Request) {
  return new Response(JSON.stringify({ ok: true, time: Date.now() }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
