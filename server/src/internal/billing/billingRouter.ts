import { Hono } from "hono";
import type { HonoEnv } from "../../honoUtils/HonoEnv.js";
import { handleCheckoutV2 } from "./checkout/handleCheckoutV2.js";
import { handleSetupPayment } from "./handlers/handleSetupPayment.js";

export const billingRouter = new Hono<HonoEnv>();

billingRouter.post("/setup_payment", ...handleSetupPayment);
billingRouter.post("/checkout", ...handleCheckoutV2);
