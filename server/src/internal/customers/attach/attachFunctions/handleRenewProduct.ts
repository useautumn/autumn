import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../honoUtils/HonoEnv.js";

export const handleRenewProduct = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	await billingActions.legacy.renew({
		ctx,
		attachParams,
		body,
	});

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.RenewedProduct,
		message: `Successfully renewed product`,
	});
};
