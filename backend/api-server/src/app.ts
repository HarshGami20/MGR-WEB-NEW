import express, { type Express } from "express";
import compression from "compression";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { apiErrorHandler } from "./middlewares/api-error";
import { logApiErrorResponses } from "./middlewares/log-api-error-responses";
import { logger } from "./lib/logger";
import path from "node:path";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
// gzip JSON responses (order lists are mostly repeated text and shrink ~5-10x — big win on mobile data).
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

app.use(logApiErrorResponses);
app.use("/api", router);
app.use(apiErrorHandler);

export default app;
