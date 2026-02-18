import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handlePlanHasCustomersV2 } from "@/internal/products/handlers/handlePlanHasCustomersV2.js";
import { handleCopyProductV2 } from "./handlers/handleCopyProduct/handleCopyProductV2.js";
import { handleCreatePlan } from "./handlers/handleCreatePlan.js";
import { handleDeleteProduct as handleDeleteProductHono } from "./handlers/handleDeleteProduct.js";
import { handleGetPlan } from "./handlers/handleGetPlan.js";
import { handleGetPlanDeleteInfo } from "./handlers/handleGetPlanDeleteInfo.js";
import { handleListPlansV2 } from "./handlers/handleListPlans/handleListPlansV2.js";
import { handleListPlans } from "./handlers/handleListPlans.js";
import { handleMigrateProductV2 } from "./handlers/handleMigrateProductV2.js";
import { handleUpdatePlan } from "./handlers/handleUpdateProduct/handleUpdatePlan.js";

export const honoProductBetaRouter = new Hono<HonoEnv>();
honoProductBetaRouter.get("", ...handleListPlans);

// Create a Hono app for products
export const honoProductRouter = new Hono<HonoEnv>();
export const migrationRouter = new Hono<HonoEnv>();

// Migrations
migrationRouter.post("/migrations", ...handleMigrateProductV2);

// CRUD
honoProductRouter.get("", ...handleListPlans);
honoProductRouter.post("", ...handleCreatePlan);
honoProductRouter.get("/:product_id", ...handleGetPlan);
honoProductRouter.post("/:product_id", ...handleUpdatePlan); // will be deprecated
honoProductRouter.patch("/:product_id", ...handleUpdatePlan); // will be deprecated
honoProductRouter.delete("/:product_id", ...handleDeleteProductHono);

// Others
honoProductRouter.post("/:product_id/copy", ...handleCopyProductV2);

// Info before deleting plan
honoProductRouter.get(
	"/:product_id/has_customers",
	...handlePlanHasCustomersV2,
);
honoProductRouter.post(
	"/:product_id/has_customers",
	...handlePlanHasCustomersV2,
);
honoProductRouter.get("/:product_id/deletion_info", ...handleGetPlanDeleteInfo);

// RPC
export const plansRpcRouter = new Hono<HonoEnv>();
plansRpcRouter.post("/plans.list", ...handleListPlansV2);
