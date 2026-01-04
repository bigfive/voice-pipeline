/**
 * HTTP Server
 * Handles health checks and basic HTTP endpoints
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';

export interface HttpServerOptions {
  port: number;
}

export class HttpServer {
  private server: Server;
  private port: number;

  constructor(options: HttpServerOptions) {
    this.port = options.port;
    this.server = createServer(this.handleRequest.bind(this));
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    } else {
      res.writeHead(404);
      res.end();
    }
  }

  /** Get the underlying HTTP server (for WebSocket attachment) */
  getServer(): Server {
    return this.server;
  }

  /** Start listening on the configured port */
  listen(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`HTTP server listening on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        resolve();
      });
    });
  }

  /** Close the server */
  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

