import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { listPlatformUsers } from "./handlers/handleListPlatformUsers.js";

/**
 * Hono router for platform API endpoints
 */
export const honoPlatformRouter = new Hono<HonoEnv>();

// GET /platform/users - List users created by master org
honoPlatformRouter.get("/users", ...listPlatformUsers);
