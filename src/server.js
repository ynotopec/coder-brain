import http from 'http';
import { BufferSystem } from '../index.js';

const PORT = 8080;
const HOST = '0.0.0.0';

const system = new BufferSystem();

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST') {
    let body = '';

    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        if (!body) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'No input provided' }));
          return;
        }

        const input = body.trim();
        const result = await system.processUserInput(input);

        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(500);
        res.end(JSON.stringify({
          error: 'Internal server error',
          message: error.message
        }));
      }
    });
  } else {
    res.writeHead(405);
    res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`);
  console.log(`📡 Ready to accept requests`);
});