import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { verifyToken } from "../lib/auth";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { createRedisClient, getRedisPublisher } from "../lib/redis-connection";
import { setSocketServer } from "./socket-registry";
import { attachSocketBridgeSubscriber } from "./socket-bridge";
import { isSuperAdminRole } from "../lib/permissions";

const sockLog = logger.child({ ns: "notifications", layer: "socket.io" });

/**
 * Socket.IO on the same HTTP server as Express. JWT via `handshake.auth.token` or `?token=`.
 * Rooms: `user:{id}`, `role:{id}`, `branch:{id}`, `broadcast`.
 */
export function attachSocketIo(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
    transports: ["websocket", "polling"],
  });

  const pub = createRedisClient("socket-io-pub");
  const sub = createRedisClient("socket-io-sub");
  if (pub && sub) {
    io.adapter(createAdapter(pub, sub));
    logger.info("Socket.IO using Redis adapter for horizontal scaling");
  }

  io.use((socket, next) => {
    try {
      const raw = socket.handshake.auth?.token ?? socket.handshake.query?.token;
      const token = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }
      const payload = verifyToken(token);
      socket.data.userId = payload.userId;
      socket.data.roleId = payload.roleId;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.data.userId as number;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        roleId: true,
        branchId: true,
        isActive: true,
        role: { select: { name: true } },
        userBranches: { select: { branchId: true } },
      },
    });
    if (!user?.isActive) {
      socket.disconnect(true);
      return;
    }

    socket.join(`user:${user.id}`);
    socket.join("broadcast");
    if (user.roleId != null) socket.join(`role:${user.roleId}`);

    let branchRooms: number[];
    if (isSuperAdminRole(user)) {
      const all = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true } });
      branchRooms = all.map((b) => b.id);
    } else {
      branchRooms =
        user.userBranches.length > 0
          ? [...new Set(user.userBranches.map((ub) => ub.branchId))]
          : user.branchId != null
            ? [user.branchId]
            : [];
    }
    for (const bid of branchRooms) {
      socket.join(`branch:${bid}`);
    }

    socket.emit("presence:self", {
      userId: user.id,
      roleId: user.roleId,
      branchId: branchRooms[0] ?? null,
      branchIds: branchRooms,
    });
    sockLog.debug({ socketId: socket.id, userId: user.id }, "client connected and joined rooms");

    socket.on("typing", (payload: { channel?: string; typing?: boolean }) => {
      const channel =
        typeof payload?.channel === "string" ? payload.channel : `user:${user.id}`;
      socket.to(channel).emit("typing", {
        userId: user.id,
        typing: Boolean(payload?.typing),
        channel,
      });
    });

    socket.on("disconnect", (reason) => {
      sockLog.debug({ socketId: socket.id, userId: user.id, reason }, "client disconnected");
      socket.broadcast.emit("presence:offline", { userId: user.id });
    });
  });

  setSocketServer(io);

  const bridge = getRedisPublisher();
  if (bridge) {
    attachSocketBridgeSubscriber(bridge, io);
  }

  return io;
}
