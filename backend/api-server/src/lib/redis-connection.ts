import Redis from "ioredis";
import { logger } from "./logger";

/**
 * BullMQ and Socket.IO bridge require Redis connections with `maxRetriesPerRequest: null`.
 */
export function createRedisClient(label: string): Redis | null {
  const url = process.env["REDIS_URL"]?.trim();
  if (!url) {
    logger.warn({ label }, "REDIS_URL not set; Redis features disabled");
    return null;
  }
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  client.on("error", (err) => logger.error({ err, label }, "Redis connection error"));
  return client;
}

let cachedPublisher: Redis | null | undefined;

/** Shared publisher for socket bridge + worker emits (lazy). */
export function getRedisPublisher(): Redis | null {
  if (cachedPublisher === undefined) {
    cachedPublisher = createRedisClient("redis-publisher");
  }
  return cachedPublisher;
}
