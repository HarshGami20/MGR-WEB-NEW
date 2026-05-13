import { Queue } from "bullmq";
import { createRedisClient } from "../lib/redis-connection";
import { logger } from "../lib/logger";

export const QUEUE_NAME = "mgr-notifications";

export type PushBatchJob = {
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, string>;
};

export type ScheduledNotificationJob = {
  notificationId: string;
};

const queueConnection = createRedisClient("bullmq-queue");

export const notificationQueue = queueConnection
  ? new Queue<PushBatchJob | ScheduledNotificationJob>(QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 86400, count: 5000 },
        removeOnFail: { age: 604800 },
      },
    })
  : null;

if (!notificationQueue) {
  logger.warn("BullMQ queue disabled (no REDIS_URL); pushes and delayed jobs run inline where possible");
}

export async function enqueuePushBatch(job: PushBatchJob): Promise<void> {
  if (!notificationQueue) return;
  const added = await notificationQueue.add("push_batch", job);
  logger.info(
    {
      ns: "notifications",
      jobId: added.id,
      name: added.name,
      targetUserCount: job.userIds.length,
    },
    "BullMQ: push_batch job added",
  );
}

export async function enqueueScheduledNotification(
  notificationId: string,
  runAt: Date,
): Promise<void> {
  if (!notificationQueue) return;
  const delay = Math.max(0, runAt.getTime() - Date.now());
  const job = await notificationQueue.add(
    "scheduled_notification",
    { notificationId },
    { delay, jobId: `sched:${notificationId}` },
  );
  logger.info(
    { ns: "notifications", jobId: job.id, notificationId, delayMs: delay },
    "BullMQ: scheduled_notification job added",
  );
}
