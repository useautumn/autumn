import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handlePreviewUpdateOrganization } from "./handlers/rpcHandlers/handlePreviewUpdateOrganization.js";
import { handleUpdateOrganization } from "./handlers/rpcHandlers/handleUpdateOrganization.js";

/** RPC router for the organization's own settings — internal, read by atmn. */
export const organizationRpcRouter = new Hono<HonoEnv>();
organizationRpcRouter.post(
	"/organization.preview_update",
	...handlePreviewUpdateOrganization,
);
organizationRpcRouter.post("/organization.update", ...handleUpdateOrganization);
