import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import {
	AppEnv,
	CouponDurationType,
	CusExpand,
	FullCustomer,
	Organization,
	RewardType,
	Subscription,
} from "@autumn/shared";
import Stripe from "stripe";

export const getCusRewards = async ({
	org,
	env,
	fullCus,
	subIds,
	expand,
}: {
	org: Organization;
	env: AppEnv;
	fullCus: FullCustomer;
	subIds?: string[];
	expand?: CusExpand[];
}) => {
	if (!expand?.includes(CusExpand.Rewards)) {
		return undefined;
	}

	if (!fullCus.processor?.id) {
		return undefined;
	}

	let stripeCli = createStripeCli({
		org,
		env,
	});

	const [stripeCus, stripeSubs] = await Promise.all([
		stripeCli.customers.retrieve(
			fullCus.processor?.id!,
		) as Promise<Stripe.Customer>,
		getStripeSubs({
			stripeCli,
			subIds,
			expand: ["discounts"],
		}),
	]);

	let stripeDiscounts: Stripe.Discount[] = stripeSubs?.flatMap(
		(s) => s.discounts,
	) as Stripe.Discount[];

	if (stripeCus.discount) {
		stripeDiscounts.push(stripeCus.discount);
	}

	let rewards = {
		discounts: stripeDiscounts.map((d) => {
			let duration_type: CouponDurationType;
			let duration_value = 0;
			if (d.coupon?.duration === "forever") {
				duration_type = CouponDurationType.Forever;
			} else if (d.coupon?.duration === "once") {
				duration_type = CouponDurationType.OneOff;
			} else if (d.coupon?.duration === "repeating") {
				duration_type = CouponDurationType.Months;
				duration_value = d.coupon?.duration_in_months || 0;
			} else {
				duration_type = CouponDurationType.OneOff;
			}
			return {
				id: d.coupon?.id,
				name: d.coupon?.name ?? "",
				type: d.coupon?.amount_off
					? RewardType.FixedDiscount
					: RewardType.PercentageDiscount,
				discount_value: d.coupon?.amount_off || d.coupon?.percent_off || 0,
				currency: d.coupon?.currency ?? null,
				start: d.start ?? null,
				end: d.end ?? null,
				subscription_id: d.subscription ?? null,
				duration_type,
				duration_value,
			};
		}),
	};

	return rewards;
};
