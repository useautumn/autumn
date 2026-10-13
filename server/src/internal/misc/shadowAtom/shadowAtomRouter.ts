import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateShadowAtom } from "./handlers/handleCreateShadowAtom.js";
import { handleDeleteShadowAtom } from "./handlers/handleDeleteShadowAtom.js";
import { handleGetShadowAtom } from "./handlers/handleGetShadowAtom.js";
import { handleGetShadowAtomMetrics } from "./handlers/handleGetShadowAtomMetrics.js";
import { handleResizeShadowAtom } from "./handlers/handleResizeShadowAtom.js";
import { handleRetryShadowAtom } from "./handlers/handleRetryShadowAtom.js";

/** Staff-only: our shadow Atom answers an org Atom's `byoc.*` calls, so the dashboard drives it with the same code. */
export const shadowAtomRpcRouter = new Hono<HonoEnv>();

shadowAtomRpcRouter.post("/byoc.create_atom", ...handleCreateShadowAtom);
shadowAtomRpcRouter.post("/byoc.get_atom", ...handleGetShadowAtom);
shadowAtomRpcRouter.post("/byoc.resize_atom", ...handleResizeShadowAtom);
shadowAtomRpcRouter.post("/byoc.retry_atom", ...handleRetryShadowAtom);
shadowAtomRpcRouter.post("/byoc.delete_atom", ...handleDeleteShadowAtom);
shadowAtomRpcRouter.post(
	"/byoc.get_atom_metrics",
	...handleGetShadowAtomMetrics,
);
