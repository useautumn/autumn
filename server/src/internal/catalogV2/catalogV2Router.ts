import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handlePreviewUpdateCatalogV2 } from "./handlers/handlePreviewUpdateCatalogV2.js";
import { handleUpdateCatalogV2 } from "./handlers/handleUpdateCatalogV2.js";

/** RPC router for the V2 catalog action (batch features + plans upsert). */
export const catalogV2RpcRouter = new Hono<HonoEnv>();
catalogV2RpcRouter.post(
	"/catalogV2.preview_update",
	...handlePreviewUpdateCatalogV2,
);
catalogV2RpcRouter.post("/catalogV2.update", ...handleUpdateCatalogV2);
