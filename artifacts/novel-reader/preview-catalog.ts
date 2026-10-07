/**
 * Preview API server (development helper, not part of production).
 *
 * Runs the real Vercel handlers from api/ so web previews can search
 * sources, submit claims, and review them without deploying.
 * The preview static server proxies /api/* here.
 *
 * Run from this directory:  pnpm exec tsx preview-catalog.ts  (port 3101)
 */
import http from 'node:http';
import catalogHandler from '../../api/catalog.ts';
import claimsSubmitHandler from '../../api/claims-submit.ts';
import claimsFollowupHandler from '../../api/claims-followup.ts';
import adminHandler from '../../api/admin.ts';
import adminClaimsHandler from '../../api/admin-claims.ts';
import adminReviewHandler from '../../api/admin-review.ts';
import { getAdminKey } from '../../api/_lib/admin-key.ts';

type Query = Record<string, string | string[]>;
type Handler = (request: Record<string, unknown>, response: Record<string, unknown>) => Promise<unknown>;

const routes: Array<[string, Handler]> = [
  ['/api/catalog', catalogHandler as Handler],
  ['/api/claims/submit', claimsSubmitHandler as Handler],
  ['/api/claims/followup', claimsFollowupHandler as Handler],
  ['/api/admin/claims', adminClaimsHandler as Handler],
  ['/api/admin/review', adminReviewHandler as Handler],
  ['/api/admin', adminHandler as Handler],
];

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      if (chunks.reduce((size, part) => size + part.length, 0) > 8_000_000) {
        req.destroy();
        resolve(null);
      }
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const route = routes.find(([prefix]) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));

  const query: Query = {};
  url.searchParams.forEach((value, key) => {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else if (Array.isArray(current)) current.push(value);
    else query[key] = [current, value];
  });

  const mockRes: Record<string, unknown> = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    status(code: number) {
      (this as { statusCode: number }).statusCode = code;
      return this;
    },
    setHeader(name: string, value: string) {
      (this as { headers: Record<string, string> }).headers[name] = value;
    },
    json(body: unknown) {
      const self = this as { statusCode: number; headers: Record<string, string> };
      res.writeHead(self.statusCode, { 'content-type': 'application/json', ...self.headers });
      res.end(JSON.stringify(body));
    },
    send(body: string) {
      const self = this as { statusCode: number; headers: Record<string, string> };
      const headers = { ...self.headers };
      if (!headers['Content-Type'] && !headers['content-type']) headers['content-type'] = 'text/html; charset=utf-8';
      res.writeHead(self.statusCode, headers);
      res.end(body);
    },
  };

  if (!route) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found.' }));
    return;
  }

  const body = req.method === 'POST' ? await readBody(req) : {};
  if (req.method === 'POST' && body === null) {
    res.writeHead(413, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'That upload is too large. Remove a few screenshots and try again.' }));
    return;
  }

  try {
    await route[1]({ method: req.method, query, body }, mockRes);
  } catch {
    if (!res.headersSent) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'The request failed. Try again.' }));
    }
  }
});

server.listen(3101, '0.0.0.0', () => {
  console.log('TipNovel preview API on port 3101');
  const key = getAdminKey();
  if (key) console.log(`Review page key: ${key}`);
});
