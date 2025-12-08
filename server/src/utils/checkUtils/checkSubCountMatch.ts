import type { FullCustomer } from "@autumn/shared";
import type Stripe from "stripe";
import type { StateCheckResult } from "./stateCheckTypes";

export const checkSubCountMatch = async ({
	fullCus,
	subs,
	result,
}: {
	fullCus: FullCustomer;
	subs: Stripe.Subscription[];
	result: StateCheckResult;
}) => {
	const cusProducts = fullCus.customer_products;
	const subIds = [...new Set(cusProducts.flatMap((cp) => cp.subscription_ids))];

	const stripeSubs = subs.filter((sub) => {
		const subCustomerId =
			typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
		return subCustomerId === fullCus.processor?.id;
	});

	if (stripeSubs.length !== subIds.length) {
		result.passed = false;
		result.errors.push(
			`Expected ${subIds.length} subs in total, found ${stripeSubs.length} in Stripe`,
		);
	} else {
		result.checks.push({
			name: `Subscription Match`,
			type: "sub_id_matching",
			passed: true,
		});
	}
};
