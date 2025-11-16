import {
	type AppEnv,
	CouponDurationType,
	CusExpand,
	type FullCustomer,
	notNullish,
	type Organization,
	RewardType,
} from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

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

	const stripeCli = createStripeCli({
		org,
		env,
	});

	const [stripeCus, stripeSubs] = await Promise.all([
		stripeCli.customers.retrieve(
			fullCus.processor?.id,
		) as Promise<Stripe.Customer>,
		getStripeSubs({
			stripeCli,
			subIds,
			expand: ["discounts", "discounts.source.coupon"],
		}),
	]);

	const stripeDiscounts: Stripe.Discount[] = stripeSubs?.flatMap(
		(s) => s.discounts,
	) as Stripe.Discount[];

	if (stripeCus.discount) {
		stripeDiscounts.push(stripeCus.discount);
	}

	const rewards = {
		discounts: stripeDiscounts
			.map((d) => {
				if (typeof d.source.coupon === "string") {
					return null;
				}

				const coupon = d.source.coupon;
				if (!coupon) {
					return null;
				}

				let duration_type: CouponDurationType;
				let duration_value = 0;
				if (coupon.duration === "forever") {
					duration_type = CouponDurationType.Forever;
				} else if (coupon.duration === "once") {
					duration_type = CouponDurationType.OneOff;
				} else if (coupon.duration === "repeating") {
					duration_type = CouponDurationType.Months;
					duration_value = coupon.duration_in_months || 0;
				} else {
					duration_type = CouponDurationType.OneOff;
				}
				return {
					id: coupon.id,
					name: coupon.name ?? "",
					type: coupon.amount_off
						? RewardType.FixedDiscount
						: RewardType.PercentageDiscount,
					discount_value: coupon.amount_off || coupon.percent_off || 0,
					currency: coupon.currency ?? null,
					start: d.start ?? null,
					end: d.end ?? null,
					subscription_id: d.subscription ?? null,
					duration_type,
					duration_value,
				};
			})
			.filter(notNullish),
	};

	return rewards;
};
