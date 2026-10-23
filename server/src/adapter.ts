// Адаптер Web-стандартных обработчиков app/api/** (GET/POST(request: Request): Response) к Fastify.
import type { FastifyReply, FastifyRequest } from 'fastify';

export type WebHandler = (request: Request) => Promise<Response> | Response;

export function webHandler(handler: WebHandler) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(key, Array.isArray(value) ? value.join(', ') : value);
    }
    const method = req.method.toUpperCase();
    let body: string | undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      headers.set('content-type', 'application/json');
      headers.delete('content-length');
    }
    const url = `http://${req.headers.host ?? 'localhost'}${req.raw.url ?? '/'}`;
    const response = await handler(new Request(url, { method, headers, body }));
    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      reply.header(key, value);
    });
    return reply.send(Buffer.from(await response.arrayBuffer()));
  };
}
