import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv";
import { handleAttachV2 } from "./attach/handleAttachV2";
import { handleCancel } from "./cancel/handleCancel";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2";
import { handleSetupPayment } from "./handlers/handleSetupPayment";

export const billingRouter = new Hono<HonoEnv>();

billingRouter.post("/setup_payment", ...handleSetupPayment);
billingRouter.post("/checkout", ...handleCheckoutV2);
billingRouter.post("/attach", ...handleAttachV2);
billingRouter.post("/cancel", ...handleCancel);
