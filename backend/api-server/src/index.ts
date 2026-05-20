import http from "node:http";
import app from "./app";
import { logger } from "./lib/logger";
import { attachSocketIo } from "./realtime/socket-server";
import { startNotificationReminderScheduler } from "./jobs/notification-reminders";
import { registerNotificationEventListeners } from "./listeners/notification-listeners";

registerNotificationEventListeners();
startNotificationReminderScheduler();

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);
attachSocketIo(server);

server.on("error", (err) => {
  logger.error({ err }, "HTTP server error");
  process.exit(1);
});

server.listen(port, () => {
  logger.info({ port }, "Server listening (HTTP + Socket.IO)");
});
