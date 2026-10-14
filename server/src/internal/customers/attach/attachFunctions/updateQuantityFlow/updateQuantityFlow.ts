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
};
