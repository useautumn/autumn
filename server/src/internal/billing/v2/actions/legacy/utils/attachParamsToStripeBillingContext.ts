import type { StripeBillingContextOverride } from "@autumn/shared";
import type { FullProduct } from "@shared/index";
import {
	type StripeCustomerWithDiscount,
	stripeSubscriptionToScheduleId,
} from "@/external/stripe/subscriptions";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { extractStripeDiscounts } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeDiscountsForBilling";
import { fetchStripeSubscriptionForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionForBilling";
import { fetchStripeSubscriptionScheduleForBilling } from "@/internal/billing/v2/providers/stripe/setup/fetchStripeSubscriptionScheduleForBilling";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams";

export const attachParamsToStripeBillingContext = async ({
	ctx,
	attachParams,
	fullProduct,
}: {
	ctx: AutumnContext;
	attachParams: AttachParams;
	fullProduct: FullProduct;
}): Promise<StripeBillingContextOverride> => {
	const stripeSubscription = await fetchStripeSubscriptionForBilling({
		ctx,
		fullCus: attachParams.customer,
		product: fullProduct,
	});

	const stripeSubscriptionSchedule =
		await fetchStripeSubscriptionScheduleForBilling({
			ctx,
			fullCus: attachParams.customer,
			products: [fullProduct],
			subscriptionScheduleId: stripeSubscriptionToScheduleId({
				stripeSubscription,
			}),
		});

	const stripeCustomer = attachParams.stripeCus as StripeCustomerWithDiscount;

	const stripeDiscounts = extractStripeDiscounts({
		stripeSubscription,
		stripeCustomer,
	});

	const { paymentMethod, now } = attachParams;

	return {
		stripeSubscription,
		stripeSubscriptionSchedule,
		stripeCustomer,
		stripeDiscounts,
		paymentMethod: paymentMethod ?? undefined,
		testClockFrozenTime: now,
	};
};
