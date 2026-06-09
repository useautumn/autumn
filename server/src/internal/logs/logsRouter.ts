import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleQueryLogs } from "./handlers/handleQueryLogs.js";
import { handleSearchLogs } from "./handlers/handleSearchLogs.js";

export const logsRpcRouter = new Hono<HonoEnv>();

logsRpcRouter.post("/logs.search", ...handleSearchLogs);
logsRpcRouter.post("/logs.query", ...handleQueryLogs);
