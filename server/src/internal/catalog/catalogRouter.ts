import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handlePreviewUpdateCatalog } from "./handlers/handlePreviewUpdateCatalog.js";
import { handleUpdateCatalog } from "./handlers/handleUpdateCatalog.js";

/** RPC router for batch catalog (features + plans) operations. */
export const catalogRpcRouter = new Hono<HonoEnv>();
catalogRpcRouter.post("/catalog.preview_update", ...handlePreviewUpdateCatalog);
catalogRpcRouter.post("/catalog.update", ...handleUpdateCatalog);
