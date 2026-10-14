import {
	type FullCustomer,
	getTargetSubscriptionScheduleCusProduct,
	type Product,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { getStripeActiveSubscriptionSchedule } from "@/external/stripe/subscriptionSchedules/index";

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

	if (subscriptionScheduleId) {
		const schedule = await getStripeActiveSubscriptionSchedule({
			stripeClient: stripeCli,
			subscriptionScheduleId,
		});
		return schedule;
	}

	const cusProductWithSchedule = getTargetSubscriptionScheduleCusProduct({
		fullCus,
		productId: product?.id,
		productGroup: product?.group,
		cusProductId: targetCusProductId,
	});

	const scheduleId = cusProductWithSchedule?.scheduled_ids?.[0];

	if (!scheduleId) return undefined;

	const schedule = await getStripeActiveSubscriptionSchedule({
		stripeClient: stripeCli,
		subscriptionScheduleId: scheduleId,
	});

	return schedule;
};
