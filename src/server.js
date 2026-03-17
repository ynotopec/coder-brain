/**
 * Server entry point - HTTP server with security features
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BrainSystem } from '../index.js';

/**
 * Rate limiter to prevent API abuse
 */
class RateLimiter {
  constructor({ windowMs = 60000, maxRequests = 50 } = {}) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    this.requests = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), windowMs);
  }

  cleanup() {
    const now = Date.now();
    for (const [clientId, data] of this.requests.entries()) {
      if ((now - data.windowStart) > this.windowMs * 2) {
        this.requests.delete(clientId);
      }
    }
  }

  checkLimit(clientId) {
    const now = Date.now();
    const clientData = this.requests.get(clientId);

    if (!clientData || (now - clientData.windowStart) > this.windowMs) {
      this.requests.set(clientId, { windowStart: now, count: 1 });
      return { allowed: true, remaining: this.maxRequests - 1 };
    }

    if (clientData.count >= this.maxRequests) {
      return { allowed: false, remaining: 0 };
    }

    clientData.count++;
    return { allowed: true, remaining: this.maxRequests - clientData.count };
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * CSRF token protection for POST requests
 */
class CSRFProtection {
  constructor() {
    this.tokens = new Map();
  }

  generateToken() {
    const token = Buffer.from(
      JSON.stringify({ time: Date.now(), random: Math.random() }) + String(Math.random())
    ).toString('hex');
    this.tokens.set(token, { expires: Date.now() + 3600000 });
    return token;
  }

  validateToken(token) {
    const entry = this.tokens.get(token);
    if (!entry || entry.expires < Date.now()) {
      return false;
    }
    this.tokens.delete(token);
    return true;
  }
}

const PORT = 8080;
const HOST = '0.0.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

const system = new BrainSystem();

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const securityLayer = {
  rateLimiter: new RateLimiter({ windowMs: 60000, maxRequests: 30 }),
  csrfProtection: new CSRFProtection()
};

/**
 * Send JSON response with headers
 */
const sendJson = (res, status, data) => {
  res.writeHead(status, { 
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(data));
};

const generateCSRFToken = (res) => {
  const token = securityLayer.csrfProtection.generateToken();
  const nonce = Buffer.from(String(Date.now() + Math.random())).toString('base64'). substring(0, 32);
  res.setHeader('X-CSRF-Token', token);
  res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self' 'nonce-${nonce}'`);
  sendJson(res, 200, { csrf_token: token, nonce });
};

/**
 * Validate and sanitize incoming request body
 */
const parseInput = (body) => {
  if (body.length > 5000) {
    return '';
  }
  const trimmed = body.trim();
  if (!trimmed) return '';

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed.input === 'string') {
      return sanitizeInput(parsed.input);
    }
  } catch {
    return sanitizeInput(trimmed);
  }

  return '';
};

/**
 * Serve static files with path traversal protection
 */
const serveStatic = (req, res) => {
  const normalizedPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(normalizedPath).replace(/^\/+/, '');
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        return sendJson(res, 404, { error: 'Not found' });
      }
      return sendJson(res, 500, { error: 'Unable to load resource' });
    }

    const ext = path.extname(filePath);
    const contentType = contentTypes[ext] || 'text/plain; charset=utf-8';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
};

const server = http.createServer(async (req, res) => {
  const clientId = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  
  // Rate limiting - check before processing request
  const rateLimitStatus = securityLayer.rateLimiter.checkLimit(clientId);
  if (!rateLimitStatus.allowed) {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(429, {
      'Retry-After': (60000 - (Date.now() % 60000)) / 1000
    });
    return sendJson(res, 429, { error: 'Too many requests' });
  }

  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'strict-dynamic' 'nonce-{{RANDOM}}'");
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/api/csrf-token') {
    generateCSRFToken(res);
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/process') {
    let body = '';
    let totalSize = 0;
    const MAX_BODY_SIZE = 10000;

    req.on('data', (chunk) => {
      const chunkSize = Buffer.byteLength(chunk, 'utf8');
      totalSize += chunkSize;
      if (totalSize > MAX_BODY_SIZE) {
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const csrfToken = req.headers['x-csrf-token'];
        if (csrfToken) {
          if (!securityLayer.csrfProtection.validateToken(csrfToken)) {
            return sendJson(res, 403, { error: 'Invalid or expired CSRF token' });
          }
        }

        const input = parseInput(body);

        if (!input) {
          return sendJson(res, 400, { error: 'No input provided' });
        }

        const result = await system.processUserInput(input);
        sendJson(res, 200, result);
      } catch (error) {
        console.error('[Server Error]', error.message);
        sendJson(res, 500, { error: 'Internal server error' });
      }
    });

    return;
  }

  sendJson(res, 405, { error: 'Method not allowed. Use GET or POST /api/process.' });
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log('📁 UI and API are ready');
});
