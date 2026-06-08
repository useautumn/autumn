import type { ApiFeatureV1 } from "@api/features/apiFeatureV1.js";
import type { ApiPlanV1 } from "@api/products/apiPlanV1.js";
import { items } from "./items.js";
import { basePrice, plan } from "./plans.js";

type AddOnConfig = {
	amount?: number | null;
	feature: ApiFeatureV1;
	interval?: "month" | "year";
	key: string;
	name?: string;
	planId: string;
};

const addOnPrice = ({
	amount,
	interval,
}: {
	amount?: number | null;
	interval: "month" | "year";
}) => {
	if (amount == null) return null;
	return interval === "month"
		? basePrice.monthly({ amount })
		: basePrice.annual({ amount });
};

/** Build keyed one-feature add-on plans for org setups with many add-ons. */
export const planList = {
	addOns: <const AddOn extends AddOnConfig>({
		addOns,
		defaultInterval = "month",
	}: {
		addOns: readonly AddOn[];
		defaultInterval?: "month" | "year";
	}): { [Item in AddOn as Item["key"]]: ApiPlanV1 } =>
		Object.fromEntries(
			addOns.map(
				({
					amount = null,
					feature,
					interval = defaultInterval,
					key,
					name,
					planId,
				}) => [
					key,
					plan.addOn({
						basePrice: addOnPrice({ amount, interval }),
						items: [items.boolean({ feature })],
						name,
						planId,
					}),
				],
			),
		) as { [Item in AddOn as Item["key"]]: ApiPlanV1 },
} as const;
