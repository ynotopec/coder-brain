import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BufferSystem } from '../index.js';

const PORT = 8080;
const HOST = '0.0.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

const system = new BufferSystem();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
};

const parseInput = (body) => {
  const trimmed = body.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.input === 'string') {
      return parsed.input;
    }
  } catch {
    return trimmed;
  }

  return '';
};

const serveStatic = (req, res) => {
  const normalizedPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(normalizedPath).replace(/^\/+/, '');
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }

      sendJson(res, 500, { error: 'Unable to load resource' });
      return;
    }

    const ext = path.extname(filePath);
    const contentType = contentTypes[ext] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
};

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/process') {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const input = parseInput(body);

        if (!input) {
          sendJson(res, 400, { error: 'No input provided' });
          return;
        }

        const result = await system.processUserInput(input);
        sendJson(res, 200, result);
      } catch (error) {
        sendJson(res, 500, {
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    return;
  }

  sendJson(res, 405, { error: 'Method not allowed. Use GET or POST /api/process.' });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log('📡 UI and API are ready');
});
