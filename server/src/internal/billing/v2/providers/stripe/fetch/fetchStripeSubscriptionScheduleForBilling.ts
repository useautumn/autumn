import {
	type FullCustomer,
	getTargetSubscriptionScheduleCusProduct,
	type Product,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";

export const fetchStripeSubscriptionScheduleForBilling = async ({
	ctx,
	fullCus,
	products,
	targetCusProductId,
	subscriptionScheduleId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	products: Product[];
	targetCusProductId?: string;
	subscriptionScheduleId?: string;
}) => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const product: Product | undefined = products[0];

	// 1. If we have a subscription schedule ID, just retrieve that
	if (subscriptionScheduleId) {
		const schedule = await stripeCli.subscriptionSchedules.retrieve(
			subscriptionScheduleId,
		);
		return schedule;
	}

	// 2. If we have a target cus product ID, get the subscription ID from that
	const cusProductWithSchedule = getTargetSubscriptionScheduleCusProduct({
		fullCus,
		productId: product?.id,
		productGroup: product?.group,
		cusProductId: targetCusProductId,
	});

	const scheduleId = cusProductWithSchedule?.scheduled_ids?.[0];

	if (!scheduleId) return undefined;

	const schedule = await stripeCli.subscriptionSchedules.retrieve(scheduleId);

	return schedule;
};
