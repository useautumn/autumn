import {
	type AttachBodyV0,
	AttachFunctionResponseSchema,
	SuccessCode,
} from "@autumn/shared";
import { billingActions } from "@/internal/billing/v2/actions/index.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import type { AutumnContext } from "../../../../../honoUtils/HonoEnv.js";

export const handleScheduleFunction2 = async ({
	ctx,
	attachParams,
	body,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	body: AttachBodyV0;
}) => {
	const { billingContext } = await billingActions.legacy.attach({
		ctx,
		attachParams,
		planTiming: "end_of_cycle",
	});

	const curCusProduct = billingContext.currentCustomerProduct;
	const product = attachParams.products[0];

	return AttachFunctionResponseSchema.parse({
		code: SuccessCode.DowngradeScheduled,
		message: `Successfully downgraded from ${curCusProduct?.product.name} to ${product.name}`,
	});
};
