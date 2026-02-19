import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handlePlanHasCustomersV2 } from "@/internal/products/handlers/handlePlanHasCustomersV2.js";
import { handleCopyProductV2 } from "./handlers/handleCopyProduct/handleCopyProductV2.js";
import { handleCreatePlan } from "./handlers/handleCreateProduct/handleCreatePlan.js";
import { handleCreatePlanV2 } from "./handlers/handleCreateProduct/handleCreatePlanV2.js";
import { handleDeletePlanV1 } from "./handlers/handleDeletePlan/handleDeletePlanV1.js";
import { handleDeletePlanV2 } from "./handlers/handleDeletePlan/handleDeletePlanV2.js";
import { handleGetPlanV1 } from "./handlers/handleGetPlan/handleGetPlanV1.js";
import { handleGetPlanV2 } from "./handlers/handleGetPlan/handleGetPlanV2.js";
import { handleGetPlanDeleteInfo } from "./handlers/handleGetPlanDeleteInfo.js";
import { handleListPlansV2 } from "./handlers/handleListPlans/handleListPlansV2.js";
import { handleListPlans } from "./handlers/handleListPlans.js";
import { handleMigrateProductV2 } from "./handlers/handleMigrateProductV2.js";
import { handleUpdatePlanV1 } from "./handlers/handleUpdatePlan/handleUpdatePlanV1.js";
import { handleUpdatePlanV2 } from "./handlers/handleUpdatePlan/handleUpdatePlanV2.js";

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
honoProductRouter.get("/:product_id", ...handleGetPlanV1);
honoProductRouter.post("/:product_id", ...handleUpdatePlanV1); // will be deprecated
honoProductRouter.patch("/:product_id", ...handleUpdatePlanV1); // will be deprecated
honoProductRouter.delete("/:product_id", ...handleDeletePlanV1);

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
plansRpcRouter.post("/plans.create", ...handleCreatePlanV2);
plansRpcRouter.post("/plans.update", ...handleUpdatePlanV2);
plansRpcRouter.post("/plans.delete", ...handleDeletePlanV2);
plansRpcRouter.post("/plans.get", ...handleGetPlanV2);
