import { Hono } from "hono";
import { handlePreviewUpdateSubscription } from "@/internal/billing/v2/updateSubscription/handlePreviewUpdateSubscription.js";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleAttach } from "./attach/handleAttach.js";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2.js";
import { handleSetupPayment } from "./handlers/handleSetupPayment.js";

import { handleUpdateSubscription } from "./v2/updateSubscription/handleUpdateSubscription.js";

export const billingRouter = new Hono<HonoEnv>();

billingRouter.post("/setup_payment", ...handleSetupPayment);
billingRouter.post("/checkout", ...handleCheckoutV2);
billingRouter.post("/attach", ...handleAttach);

billingRouter.post("/subscriptions/update", ...handleUpdateSubscription);
billingRouter.post(
	"/subscriptions/preview_update",
	...handlePreviewUpdateSubscription,
);
