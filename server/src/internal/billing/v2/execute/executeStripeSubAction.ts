import type { AutumnContext } from "../../../../honoUtils/HonoEnv";
import type { StripeSubAction } from "../types";

export const executeStripeSubAction = async ({
	ctx,
	stripeSubAction,
}: {
	ctx: AutumnContext;
	stripeSubAction: StripeSubAction;
}) => {
	switch (
		stripeSubAction.type
		// case "create":
		// 	return await executeStripeSubCreate({ ctx, stripeSubAction });

		// case "update":
		// 	return await executeStripeSubUpdate({ ctx, stripeSubAction });
		// 	return await executeStripeSubUpdate({ ctx, stripeSubAction });
		// case "cancel_immediately":
		// 	return await executeStripeSubCancelImmediately({ ctx, stripeSubAction });
		// case "cancel_at_period_end":
		// 	return await executeStripeSubCancelAtPeriodEnd({ ctx, stripeSubAction });
		// case "none":
	) {
	}
};
