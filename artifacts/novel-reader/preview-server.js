/**
 * TipNovel preview server (hackathon helper, not part of production).
 *
 * The Expo web export uses experiments.baseUrl "/app" (see app.json), so the
 * built index.html references /app/_expo/... assets. Plain static servers
 * (python http.server, npx serve) serve dist/ at root and 404 those assets,
 * which shows as a white screen. This tiny server mirrors the production layout
 * built by scripts/prepare-landing.js:
 *   /            -> dist/index.html (landing page)
 *   /app/*       -> dist/app/*    (the reader, SPA fallback to dist/app/index.html)
 *   anything else -> dist/*       (landing assets, manifest)
 *
 * Run from this directory:  node preview-server.js   (serves port 3000)
 * Zero dependencies, Node built-ins only.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const DIST = path.resolve(__dirname, "dist");
const PORT = parseInt(process.env.PORT || "3000", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};

function send(res, file) {
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://localhost");
  let p = url.pathname;

  if (p === "/") {
    return send(res, path.join(DIST, "index.html"));
  }
  if (p === "/app" || p === "/app/") {
    return send(res, path.join(DIST, "app", "index.html"));
  }
  if (p.startsWith("/app/")) {
    p = p.slice(4);
    const file = path.join(DIST, decodeURIComponent(p));
    if (!file.startsWith(DIST)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    return fs.stat(file, (err, st) => {
      if (!err && st.isFile()) return send(res, file);
      send(res, path.join(DIST, "app", "index.html"));
    });
  }
  const file = path.join(DIST, decodeURIComponent(p));
  if (!file.startsWith(DIST)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.stat(file, (err, st) => {
    if (!err && st.isFile()) {
      return send(res, file);
    }
    // SPA fallback for client-side routes under /app/*
    send(res, path.join(DIST, "index.html"));
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TipNovel preview serving dist/ on port ${PORT} (app at /app/)`);
});
