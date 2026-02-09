import { AttachFunctionResponseSchema, SuccessCode } from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";

export const handleUpgradeFlow = async ({
	ctx,
	attachParams,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
}) => {
	const { billingResponse, billingResult } = await billingActions.legacy.attach(
		{
			ctx,
			attachParams,
			planTiming: "immediate",
		},
	);

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.UpgradedToNewProduct,
		message: `Successfully updated product`,

		checkout_url: billingResponse?.payment_url,

		invoice: attachParams.invoiceOnly
			? billingResult?.stripe?.stripeInvoice
			: undefined,
	});
};
