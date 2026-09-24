import { ErrCode, orgDisableStripeWrites, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

/** Billing details only live in Stripe, so they can't be set while the org blocks Stripe writes. */
export const assertBillingDetailsWritable = ({
	ctx,
}: {
	ctx: AutumnContext;
}) => {
	if (!orgDisableStripeWrites({ ctx })) return;
	throw new RecaseError({
		message:
			"billing_details can't be set because Stripe writes are disabled for this organization.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
