import { Hono } from "hono";
import { handlePreviewUpdateSubscription } from "@/internal/billing/v2/updateSubscription/handlePreviewUpdateSubscription.js";
import { handleAttachPreview } from "@/internal/customers/attach/handleAttachPreview/handleAttachPreview.js";
import { handleCancelV2 } from "@/internal/customers/cancel/handleCancelV2.js";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAttach } from "./attach/handleAttach.js";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2.js";
import { handleSetupPayment } from "./handlers/handleSetupPayment.js";
import { handleAttachV2 } from "./v2/attach/handleAttachV2.js";
import { handleUpdateSubscription } from "./v2/updateSubscription/handleUpdateSubscription.js";

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
billingRouter.post("/v2/attach", ...handleAttachV2);
