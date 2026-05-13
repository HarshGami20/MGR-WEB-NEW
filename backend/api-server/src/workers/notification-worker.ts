import { Worker } from "bullmq";
import { createRedisClient } from "../lib/redis-connection";
import { logger } from "../lib/logger";
import { QUEUE_NAME, type PushBatchJob } from "../queues/notification-queue";
import { flushPushBatch, notificationService } from "../services/notification-service";

const connection = createRedisClient("bullmq-worker");

if (!connection) {
  logger.error("notification-worker requires REDIS_URL");
  process.exit(1);
}

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    logger.info({ ns: "notifications", jobId: job.id, name: job.name }, "notification worker: job started");
    if (job.name === "push_batch") {
      await flushPushBatch(job.data as PushBatchJob);
      return;
    }
    if (job.name === "scheduled_notification") {
      const id = (job.data as { notificationId: string }).notificationId;
      await notificationService.deliverScheduledNotification(id);
      return;
    }
    logger.warn({ jobName: job.name }, "unknown notification job");
  },
  { connection },
);

worker.on("completed", (job) => {
  logger.info({ ns: "notifications", jobId: job.id, name: job.name }, "notification worker: job completed");
});

worker.on("failed", (job, err) => {
  logger.error({ err, jobId: job?.id, name: job?.name }, "notification job failed");
});

logger.info({ queue: QUEUE_NAME }, "notification-worker listening");
