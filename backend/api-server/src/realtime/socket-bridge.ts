import type { Server as SocketIoServer } from "socket.io";
import type Redis from "ioredis";
import { logger } from "../lib/logger";
import { getSocketServer } from "./socket-registry";

export const SOCKET_BRIDGE_CHANNEL = process.env["SOCKET_BRIDGE_CHANNEL"] ?? "mgr:notifications:socket";

export type SocketBridgeMessage = {
  rooms: string[];
  event: string;
  data: unknown;
};

/**
 * When Redis is available, workers publish here; the API process subscribes and emits through Socket.IO.
 * Falls back to direct emit when only the API process runs (no Redis).
 */
export function emitViaBridge(
  redis: Redis | null,
  io: SocketIoServer | null,
  message: SocketBridgeMessage,
): void {
  if (redis) {
    redis.publish(SOCKET_BRIDGE_CHANNEL, JSON.stringify(message)).catch((err) =>
      logger.error({ err }, "socket bridge publish failed"),
    );
    return;
  }
  if (io) {
    for (const room of message.rooms) {
      io.to(room).emit(message.event, message.data);
    }
    return;
  }
  const fallback = getSocketServer();
  if (fallback) {
    for (const room of message.rooms) {
      fallback.to(room).emit(message.event, message.data);
    }
  }
}

export function attachSocketBridgeSubscriber(redis: Redis, io: SocketIoServer): void {
  const duplicate = redis.duplicate();
  duplicate
    .subscribe(SOCKET_BRIDGE_CHANNEL)
    .catch((err) => logger.error({ err }, "socket bridge subscribe failed"));
  duplicate.on("message", (_channel, payload) => {
    try {
      const msg = JSON.parse(payload) as SocketBridgeMessage;
      if (!msg?.rooms?.length || !msg.event) return;
      for (const room of msg.rooms) {
        io.to(room).emit(msg.event, msg.data);
      }
    } catch (err) {
      logger.error({ err }, "socket bridge message parse failed");
    }
  });
}
