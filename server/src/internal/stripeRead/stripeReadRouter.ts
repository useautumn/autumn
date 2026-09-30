import { Hono } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { handleSearchStripeEndpoints } from "./handlers/handleSearchStripeEndpoints.js";
import { handleStripeGet } from "./handlers/handleStripeGet.js";

/** GET-only Stripe passthrough scoped to the caller's org. */
export const stripeReadRpcRouter = new Hono<HonoEnv>();
stripeReadRpcRouter.post("/stripe.get", ...handleStripeGet);
stripeReadRpcRouter.post(
	"/stripe.search_endpoints",
	...handleSearchStripeEndpoints,
);
