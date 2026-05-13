import fs from "node:fs";
import { logger } from "./logger";

let admin: typeof import("firebase-admin") | null = null;
let initAttempted = false;

function loadServiceAccount(): object | null {
  const json = process.env["FIREBASE_SERVICE_ACCOUNT_JSON"]?.trim();
  if (json) {
    try {
      return JSON.parse(json) as object;
    } catch (e) {
      logger.error({ e }, "Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
      return null;
    }
  }
  const path = process.env["GOOGLE_APPLICATION_CREDENTIALS"]?.trim();
  if (path) {
    try {
      const raw = fs.readFileSync(path, "utf8");
      return JSON.parse(raw) as object;
    } catch (e) {
      logger.error({ e }, "Could not read GOOGLE_APPLICATION_CREDENTIALS");
      return null;
    }
  }
  return null;
}

/** Lazy Firebase Admin; push features no-op when unset. */
export async function getFirebaseMessaging(): Promise<
  import("firebase-admin/messaging").Messaging | null
> {
  if (initAttempted) {
    return admin?.messaging() ?? null;
  }
  initAttempted = true;
  const cred = loadServiceAccount();
  if (!cred) {
    logger.warn(
      { hint: "Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON" },
      "Firebase Admin not configured; FCM sends are skipped",
    );
    return null;
  }
  try {
    admin = await import("firebase-admin");
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(cred as import("firebase-admin/app").ServiceAccount),
      });
    }
    const projectId =
      typeof (cred as { project_id?: unknown }).project_id === "string"
        ? (cred as { project_id: string }).project_id
        : undefined;
    logger.info({ firebaseProjectId: projectId }, "Firebase Admin ready for FCM");
    return admin.messaging();
  } catch (e) {
    logger.error({ e }, "Firebase Admin init failed");
    return null;
  }
}
