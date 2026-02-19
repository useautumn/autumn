import { Hono } from "hono";
import { handlePreviewAttach } from "@/internal/billing/v2/handlers/handlePreviewAttach.js";
import { handleAttachPreview } from "@/internal/customers/attach/handleAttachPreview/handleAttachPreview.js";
import { handleCancelV2 } from "@/internal/customers/cancel/handleCancelV2.js";
import { handleOpenCustomerPortalV2 } from "@/internal/customers/handlers/handleBillingPortal/handleOpenCustomerPortalV2.js";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAttach } from "./attach/handleAttach.js";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2.js";
import { handleSetupPayment } from "./handlers/handleSetupPayment.js";
import { handleAttachV2 } from "./v2/handlers/handleAttachV2.js";
import { handlePreviewUpdateSubscription } from "./v2/handlers/handlePreviewUpdateSubscription.js";
import { handleUpdateSubscription } from "./v2/handlers/handleUpdateSubscription.js";

export const billingRouter = new Hono<HonoEnv>();

// Legacy
billingRouter.post("/attach/preview", ...handleAttachPreview);
billingRouter.post("/cancel", ...handleCancelV2);

billingRouter.post("/setup_payment", ...handleSetupPayment);
billingRouter.post("/checkout", ...handleCheckoutV2);
billingRouter.post("/attach", ...handleAttach);
billingRouter.post("/subscriptions/update", ...handleUpdateSubscription);
billingRouter.post(
	"/subscriptions/preview_update",
	...handlePreviewUpdateSubscription,
);

// V2 Attach
// billingRouter.post("/billing/attach", ...handleAttachV2);
// billingRouter.post("/billing/preview_attach", ...handlePreviewAttach);

export const billingRpcRouter = new Hono<HonoEnv>();
billingRpcRouter.post("/billing.update", ...handleUpdateSubscription);
billingRpcRouter.post(
	"/billing.preview_update",
	...handlePreviewUpdateSubscription,
);
billingRpcRouter.post("/billing.attach", ...handleAttachV2);
billingRpcRouter.post("/billing.preview_attach", ...handlePreviewAttach);
billingRpcRouter.post(
	"/billing.open_customer_portal",
	...handleOpenCustomerPortalV2,
);
