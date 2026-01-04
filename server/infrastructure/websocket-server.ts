/**
 * WebSocket Server
 * Manages WebSocket connections and message routing
 */

import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import type { ServerMessage, ClientMessage } from '../../shared/protocol';

export type ConnectionId = string;

export interface WebSocketConnection {
  id: ConnectionId;
  ws: WebSocket;
  connectedAt: number;
}

export interface ConnectionHandler {
  onConnect: (connection: WebSocketConnection) => void;
  onMessage: (connection: WebSocketConnection, message: ClientMessage) => void;
  onDisconnect: (connection: WebSocketConnection) => void;
  onError: (connection: WebSocketConnection, error: Error) => void;
}

export class WebSocketServerWrapper {
  private wss: WebSocketServer;
  private connections = new Map<ConnectionId, WebSocketConnection>();
  private handler: ConnectionHandler;
  private connectionCounter = 0;

  constructor(httpServer: Server, handler: ConnectionHandler) {
    this.handler = handler;
    this.wss = new WebSocketServer({ server: httpServer });
    this.setupListeners();
  }

  private setupListeners(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const connection = this.createConnection(ws);
      this.connections.set(connection.id, connection);

      console.log(`Client connected: ${connection.id}`);
      this.handler.onConnect(connection);

      ws.on('message', (data: Buffer | string) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;
          this.handler.onMessage(connection, message);
        } catch (err) {
          console.error(`Invalid message from ${connection.id}:`, err);
          this.send(connection.id, { type: 'error', message: 'Invalid message format' });
        }
      });

      ws.on('close', () => {
        console.log(`Client disconnected: ${connection.id}`);
        this.connections.delete(connection.id);
        this.handler.onDisconnect(connection);
      });

      ws.on('error', (err: Error) => {
        console.error(`WebSocket error for ${connection.id}:`, err);
        this.handler.onError(connection, err);
      });
    });
  }

  private createConnection(ws: WebSocket): WebSocketConnection {
    const id = `conn_${++this.connectionCounter}_${Date.now()}`;
    return {
      id,
      ws,
      connectedAt: Date.now(),
    };
  }

  /** Send a message to a specific connection */
  send(connectionId: ConnectionId, message: ServerMessage): boolean {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    connection.ws.send(JSON.stringify(message));
    return true;
  }

  /** Get a connection by ID */
  getConnection(id: ConnectionId): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /** Get all active connections */
  getConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /** Close a specific connection */
  closeConnection(connectionId: ConnectionId): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.ws.close();
      this.connections.delete(connectionId);
    }
  }

  /** Close all connections */
  closeAll(): void {
    for (const connection of this.connections.values()) {
      connection.ws.close();
    }
    this.connections.clear();
  }
}

