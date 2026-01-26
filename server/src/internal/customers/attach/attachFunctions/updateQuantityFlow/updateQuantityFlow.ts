import {
	type AttachConfig,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import type Stripe from "stripe";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { isStripeSubscriptionCanceling } from "@/external/stripe/subscriptions/utils/classifyStripeSubscriptionUtils.js";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";
import { attachParamToCusProducts } from "../../attachUtils/convertAttachParams.js";
import { handleUpdateFeatureQuantity } from "./updateFeatureQuantity.js";

export const handleUpdateQuantityFunction = async ({
	ctx,
	attachParams,
	config,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	config: AttachConfig;
}) => {
	const { db } = ctx;

	// Update quantities
	const optionsToUpdate = attachParams.optionsToUpdate!;
	const { curSameProduct } = attachParamToCusProducts({ attachParams });

	// Check balance of each option to update...?
	const stripeCli = attachParams.stripeCli;
	const cusProduct = curSameProduct!;
	const stripeSubs = await getStripeSubs({
		stripeCli: stripeCli,
		subIds: cusProduct.subscription_ids || [],
	});

	const invoices: Stripe.Invoice[] = [];

	for (const options of optionsToUpdate) {
		const result = await handleUpdateFeatureQuantity({
			ctx,
			attachParams,
			attachConfig: config,
			cusProduct,
			stripeSubs,
			oldOptions: options.old,
			newOptions: options.new,
		});

		if (result?.invoice) {
			invoices.push(result.invoice);
		}
	}

	for (const stripeSub of stripeSubs) {
		if (isStripeSubscriptionCanceling(stripeSub)) {
			await stripeCli.subscriptions.update(stripeSub.id, {
				cancel_at: null,
			});
		}
	}

	await CusProductService.update({
		db,
		cusProductId: cusProduct.id,
		updates: {
			options: optionsToUpdate.map((o) => o.new),
			canceled_at: null,
			canceled: false,
			ended_at: null,
		},
	});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.FeaturesUpdated,
		message: `Successfully updated quantity for features: ${optionsToUpdate.map((o) => o.new.feature_id).join(", ")}`,
		invoice:
			config.invoiceOnly && invoices.length > 0 ? invoices[0] : undefined,
	});
};
