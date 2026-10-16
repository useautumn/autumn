import { BillingFeatureId } from "@autumn/billing";
import { Hono } from "hono";
import { billingFeatureMiddleware } from "@/honoMiddlewares/billingFeatureMiddleware.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleCreateCache } from "./handlers/handleCreateCache.js";
import { handleDeleteCache } from "./handlers/handleDeleteCache.js";
import { handleFinishCacheSetup } from "./handlers/handleFinishCacheSetup.js";
import { handleGetAtomMetrics } from "./handlers/handleGetAtomMetrics.js";
import { handleGetCache } from "./handlers/handleGetCache.js";
import { handleGetCacheUpdate } from "./handlers/handleGetCacheUpdate.js";
import { handleIncreaseCacheStorage } from "./handlers/handleIncreaseCacheStorage.js";
import { handleListAtomChecks } from "./handlers/handleListAtomChecks.js";
import { handleListAtoms } from "./handlers/handleListAtoms.js";
import { handleResizeCache } from "./handlers/handleResizeCache.js";
import { handleRetryCache } from "./handlers/handleRetryCache.js";

export const byocRpcRouter = new Hono<HonoEnv>();

// Scoped to byoc.* paths: this router mounts at "", so "*" would also gate every rpc route mounted after it.
byocRpcRouter.use(
	"/:rpc{byoc\\..+}",
	billingFeatureMiddleware({
		featureId: BillingFeatureId.Atoms,
		featureName: "Atom",
	}),
);

byocRpcRouter.post("/byoc.create_atom", ...handleCreateCache);
byocRpcRouter.post("/byoc.get_atom", ...handleGetCache);
byocRpcRouter.post("/byoc.get_atom_update", ...handleGetCacheUpdate);
byocRpcRouter.post("/byoc.list_atoms", ...handleListAtoms);
byocRpcRouter.post("/byoc.resize_atom", ...handleResizeCache);
byocRpcRouter.post(
	"/byoc.increase_atom_storage",
	...handleIncreaseCacheStorage,
);
byocRpcRouter.post("/byoc.retry_atom", ...handleRetryCache);
byocRpcRouter.post("/byoc.delete_atom", ...handleDeleteCache);
byocRpcRouter.post("/byoc.list_atom_checks", ...handleListAtomChecks);
byocRpcRouter.post("/byoc.finish_atom_setup", ...handleFinishCacheSetup);
byocRpcRouter.post("/byoc.get_atom_metrics", ...handleGetAtomMetrics);
