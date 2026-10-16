import { Hono } from "hono";
import { handleListRevenueCatMappings } from "@/external/revenueCat/handlers/handleListRevenueCatMappings.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { catalogEditApproval } from "@/internal/approvals/enforce/access/catalogEditApproval.js";
import { handlePlanHasCustomersV2 } from "@/internal/products/handlers/handlePlanHasCustomersV2.js";
import { handleGetLicenseProducts } from "@/internal/products/internalHandlers/handleGetProducts.js";
import { handleCopyProductV2 } from "./handlers/handleCopyProduct/handleCopyProductV2.js";
import { handleCreatePlanInStripe } from "./handlers/handleCreatePlanInStripe.js";
import { handleCreatePlan } from "./handlers/handleCreateProduct/handleCreatePlan.js";
import { handleCreatePlanV2 } from "./handlers/handleCreateProduct/handleCreatePlanV2.js";
import { handleCreateVariantV2 } from "./handlers/handleCreateVariant/handleCreateVariantV2.js";
import { handleDeletePlanV1 } from "./handlers/handleDeletePlan/handleDeletePlanV1.js";
import { handleDeletePlanV2 } from "./handlers/handleDeletePlan/handleDeletePlanV2.js";
import { handleGetPlanV1 } from "./handlers/handleGetPlan/handleGetPlanV1.js";
import { handleGetPlanV2 } from "./handlers/handleGetPlan/handleGetPlanV2.js";
import { handleGetPlanDeleteInfo } from "./handlers/handleGetPlanDeleteInfo.js";
import { handleListPlansV2 } from "./handlers/handleListPlans/handleListPlansV2.js";
import { handleListPlans } from "./handlers/handleListPlans.js";
import { handlePreviewUpdatePlanV2 } from "./handlers/handlePreviewUpdatePlan/handlePreviewUpdatePlanV2.js";
import { handleSplitVariantStripeProduct } from "./handlers/handleSplitVariantStripeProduct.js";
import { handleUpdatePlanV1 } from "./handlers/handleUpdatePlan/handleUpdatePlanV1.js";
import { handleUpdatePlanV2 } from "./handlers/handleUpdatePlan/handleUpdatePlanV2.js";

export const honoProductBetaRouter = new Hono<HonoEnv>();
honoProductBetaRouter.get("", ...handleListPlans);

// Create a Hono app for products
export const honoProductRouter = new Hono<HonoEnv>();

// CRUD
honoProductRouter.get("", ...handleListPlans);
honoProductRouter.post(
	"",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.id],
	}),
	...handleCreatePlan,
);
honoProductRouter.get("/license_products", ...handleGetLicenseProducts);
honoProductRouter.get("/:product_id", ...handleGetPlanV1);
honoProductRouter.post(
	"/:product_id",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body, params }) => [params.product_id, body.id],
	}),
	...handleUpdatePlanV1,
); // will be deprecated
honoProductRouter.patch(
	"/:product_id",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body, params }) => [params.product_id, body.id],
	}),
	...handleUpdatePlanV1,
); // will be deprecated
honoProductRouter.delete(
	"/:product_id",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ params }) => [params.product_id],
	}),
	...handleDeletePlanV1,
);

// Others
honoProductRouter.post(
	"/:product_id/copy",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.id],
	}),
	...handleCopyProductV2,
);

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
plansRpcRouter.post(
	"/plans.create",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.plan_id],
	}),
	...handleCreatePlanV2,
);
plansRpcRouter.post(
	"/plans.update",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.plan_id, body.new_plan_id],
	}),
	...handleUpdatePlanV2,
);
plansRpcRouter.post(
	"/plans.delete",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.plan_id],
	}),
	...handleDeletePlanV2,
);
plansRpcRouter.post("/plans.get", ...handleGetPlanV2);
plansRpcRouter.post(
	"/plans.revenuecat_mappings",
	...handleListRevenueCatMappings,
);
plansRpcRouter.post("/plans.has_customers", ...handlePlanHasCustomersV2);
plansRpcRouter.post(
	"/plans.create_variant",
	catalogEditApproval({
		action: "catalog.edit_plans",
		ids: ({ body }) => [body.base_plan_id, body.variant_plan_id],
	}),
	...handleCreateVariantV2,
);
plansRpcRouter.post(
	"/plans.split_variant_stripe_product",
	...handleSplitVariantStripeProduct,
);
plansRpcRouter.post("/plans.create_in_stripe", ...handleCreatePlanInStripe);
plansRpcRouter.post("/plans.preview_update", ...handlePreviewUpdatePlanV2);
