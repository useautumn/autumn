import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleGetCatalogMappings } from "./handlers/handleGetCatalogMappings.js";
import { handlePreviewUpdateCatalog } from "./handlers/handlePreviewUpdateCatalog.js";
import { handleUpdateCatalog } from "./handlers/handleUpdateCatalog.js";
import { handleUpdateCatalogMappings } from "./handlers/handleUpdateCatalogMappings.js";

/** RPC router for batch catalog (features + plans) operations. */
export const catalogRpcRouter = new Hono<HonoEnv>();
catalogRpcRouter.post("/catalog.get_mappings", ...handleGetCatalogMappings);
catalogRpcRouter.post("/catalog.preview_update", ...handlePreviewUpdateCatalog);
catalogRpcRouter.post("/catalog.update_mappings", ...handleUpdateCatalogMappings);
catalogRpcRouter.post("/catalog.update", ...handleUpdateCatalog);
