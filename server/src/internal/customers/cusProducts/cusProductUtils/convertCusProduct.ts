import type {
	FullCusEntWithFullCusProduct,
	FullCusProduct,
} from "@autumn/shared";
import type Stripe from "stripe";

import { getStripeSubs } from "@/external/stripe/stripeSubUtils.js";

export const cusProductToSchedule = async ({
	cusProduct,
	stripeCli,
}: {
	cusProduct: FullCusProduct;
	stripeCli: Stripe;
}) => {
	const subScheduleIds = cusProduct?.scheduled_ids || [];
	if (subScheduleIds.length === 0) {
		return null;
	}

	const schedule = await stripeCli.subscriptionSchedules.retrieve(
		subScheduleIds[0],
		{
			expand: ["phases.items.price"],
		},
	);

	if (schedule.status === "canceled" || schedule.status === "released") {
		return undefined;
	}

	return schedule;
};

export const cusProductToSub = async ({
	cusProduct,
	stripeCli,
}: {
	cusProduct?: FullCusProduct;
	stripeCli: Stripe;
}) => {
	const subId = cusProduct?.subscription_ids?.[0];
	if (!subId) {
		return undefined;
	}
	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: ["items.data.price.tiers", "discounts.coupon.applies_to"],
	});

	return sub;
};

const cusProductsToStripeSubs = ({
	cusProducts,
	stripeCli,
}: {
	cusProducts: FullCusProduct[];
	stripeCli: Stripe;
}) => {
	return getStripeSubs({
		stripeCli,
		subIds: cusProducts.flatMap((p: any) => p.subscription_ids || []),
	});
};

export const cusProductToCusEnt = ({
	cusProduct,
	featureId,
}: {
	cusProduct: FullCusProduct;
	featureId: string;
}) => {
	const cusEnts = cusProduct.customer_entitlements;

	const fullCusEnt = cusEnts.find(
		(ce) => ce.entitlement.feature.id === featureId,
	);

	if (fullCusEnt) {
		return {
			...fullCusEnt,
			customer_product: cusProduct,
		} as FullCusEntWithFullCusProduct;
	}

	return undefined;
};
