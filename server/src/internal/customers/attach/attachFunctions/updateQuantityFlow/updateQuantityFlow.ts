import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";
import type { AttachParams } from "../../../cusProducts/AttachParams.js";

export const handleUpdateQuantityFunction = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	const { billingResponse, billingResult } =
		await billingActions.legacy.updateQuantity({
			ctx,
			body,
			attachParams,
		});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.FeaturesUpdated,
		message: `Successfully updated quantity for features`,
		invoice: billingResult?.stripe?.stripeInvoice,
		checkout_url: billingResponse?.payment_url,
	});

	// // Check balance of each option to update...?
	// const stripeCli = attachParams.stripeCli;
	// const cusProduct = curSameProduct!;
	// const stripeSubs = await getStripeSubs({
	// 	stripeCli: stripeCli,
	// 	subIds: cusProduct.subscription_ids || [],
	// });

	// for (const options of optionsToUpdate) {
	// 	const result = await handleUpdateFeatureQuantity({
	// 		ctx,
	// 		attachParams,
	// 		attachConfig: config,
	// 		cusProduct,
	// 		stripeSubs,
	// 		oldOptions: options.old,
	// 		newOptions: options.new,
	// 	});

	// 	if (result?.invoice) {
	// 		invoices.push(result.invoice);
	// 	}
	// }

	// for (const stripeSub of stripeSubs) {
	// 	if (isStripeSubscriptionCanceling(stripeSub)) {
	// 		await stripeCli.subscriptions.update(stripeSub.id, {
	// 			cancel_at: null,
	// 		});
	// 	}
	// }
};
