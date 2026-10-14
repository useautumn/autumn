import { ErrCode, orgDisableStripeWrites, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

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
