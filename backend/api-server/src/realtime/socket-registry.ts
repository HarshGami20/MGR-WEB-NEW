import type { Server as SocketIoServer } from "socket.io";

let io: SocketIoServer | null = null;

export function setSocketServer(instance: SocketIoServer): void {
  io = instance;
}

export function getSocketServer(): SocketIoServer | null {
  return io;
}
