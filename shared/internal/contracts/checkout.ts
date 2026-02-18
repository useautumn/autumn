import { FeatureOptionsSchema } from "@models/cusProductModels/cusProductModels";
import { oc } from "@orpc/contract";
import { z } from "zod/v4";
import {
	ConfirmCheckoutResponseSchema,
	GetCheckoutResponseSchema,
} from "../checkout/checkoutResponses";

export const getCheckoutContract = oc
	.route({
		method: "GET",
		path: "/checkouts/{checkout_id}",
		tags: ["internal"],
	})
	.input(z.object({ checkout_id: z.string() }))
	.output(GetCheckoutResponseSchema);

export const previewCheckoutContract = oc
	.route({
		method: "POST",
		path: "/checkouts/{checkout_id}/preview",
		tags: ["internal"],
	})
	.input(
		z.object({
			checkout_id: z.string(),
			options: z.array(
				FeatureOptionsSchema.pick({
					feature_id: true,
					quantity: true,
				}),
			),
		}),
	)
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
	previewCheckout: previewCheckoutContract,
	confirmCheckout: confirmCheckoutContract,
};
