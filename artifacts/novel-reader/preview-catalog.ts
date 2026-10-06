/**
 * Preview catalogue API (development helper, not part of production).
 *
 * Runs the real Vercel handler from api/catalog.ts so web previews can
 * search sources, open novels, and load chapters without deploying.
 * The preview static server proxies /api/* here.
 *
 * Run from this directory:  pnpm exec tsx preview-catalog.ts  (port 3101)
 */
import http from 'node:http';
import handler from '../../../api/catalog.ts';

type Query = Record<string, string | string[]>;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/catalog')) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.' }));
    return;
  }

  const query: Query = {};
  url.searchParams.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  });

  const mockRes = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    json(body: unknown) {
      res.writeHead(this.statusCode, { 'content-type': 'application/json', ...this.headers });
      res.end(JSON.stringify(body));
    },
  };

  void Promise.resolve(handler({ method: req.method, query }, mockRes)).catch(() => {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'The catalogue service could not be reached.' }));
    }
  });
});

server.listen(3101, '0.0.0.0', () => {
  console.log('TipNovel preview catalogue API on port 3101');
});
