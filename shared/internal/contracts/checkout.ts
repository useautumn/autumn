import { oc } from "@orpc/contract";
import { z } from "zod/v4";
import {
	ConfirmCheckoutResponseSchema,
	GetCheckoutResponseSchema,
} from "../checkout/checkoutResponses.js";

export const getCheckoutContract = oc
	.route({
		method: "GET",
		path: "/checkouts/{checkout_id}",
		tags: ["internal"],
	})
	.input(z.object({ checkout_id: z.string() }))
	.output(GetCheckoutResponseSchema);

export const confirmCheckoutContract = oc
	.route({
		method: "POST",
		path: "/checkouts/{checkout_id}/confirm",
		tags: ["internal"],
	})
	.input(z.object({ checkout_id: z.string() }))
	.output(ConfirmCheckoutResponseSchema);

export const checkoutContract = {
	getCheckout: getCheckoutContract,
	confirmCheckout: confirmCheckoutContract,
};
