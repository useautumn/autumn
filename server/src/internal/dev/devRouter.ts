import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCreateSecretKey } from "./handlers/handleCreateSecretKey.js";
import { handleDeleteSecretKey } from "./handlers/handleDeleteSecretKey.js";
import { handleGetDevData } from "./handlers/handleGetDevData.js";

export const internalDevRouter = new Hono<HonoEnv>();
internalDevRouter.get("/data", ...handleGetDevData);
internalDevRouter.post("/api_key", ...handleCreateSecretKey);
internalDevRouter.delete("/api_key/:key_id", ...handleDeleteSecretKey);
