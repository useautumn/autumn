import { Hono } from "hono";
import { handleSubscriptionUpdatePreview } from "@/internal/billing/v2/subscriptionUpdate/handleSubscriptionUpdatePreview.js";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAttach } from "./attach/handleAttach.js";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2.js";
import { handleSetupPayment } from "./handlers/handleSetupPayment.js";
import { handleApiSubscriptionUpdate } from "./v2/handlers/handleApiSubscriptionUpdate.js";
import { handleAttachV2 } from "./v2/handlers/handleAttachV2.js";

export const billingRouter = new Hono<HonoEnv>();

billingRouter.post("/setup_payment", ...handleSetupPayment);
billingRouter.post("/checkout", ...handleCheckoutV2);
billingRouter.post("/attach", ...handleAttach);
billingRouter.post("/attach_v2", ...handleAttachV2);

billingRouter.post("/subscriptions/update", ...handleApiSubscriptionUpdate);
billingRouter.post(
	"/subscriptions/preview/update",
	...handleSubscriptionUpdatePreview,
);
