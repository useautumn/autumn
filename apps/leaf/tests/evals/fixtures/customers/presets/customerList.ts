import type { ApiSubscriptionV1 } from "@api/customers/cusPlans/apiSubscriptionV1.js";
import { baseCustomer } from "../base/baseCustomer.js";

/** Generate deterministic customers for broad list/search evals. */
export const customerList = ({
	count,
	emailDomain = "example.test",
	idPrefix = "customer",
	namePrefix = "Customer",
	subscription,
}: {
	count: number;
	emailDomain?: string;
	idPrefix?: string;
	namePrefix?: string;
	subscription?: ({
		index,
	}: {
		index: number;
	}) => ApiSubscriptionV1 | undefined;
}) =>
	Array.from({ length: count }, (_, index) => {
		const number = index + 1;
		const padded = String(number).padStart(3, "0");
		const id = `${idPrefix}_${padded}`;
		const maybeSubscription = subscription?.({ index });

		return baseCustomer({
			id,
			email: `${id}@${emailDomain}`,
			name: `${namePrefix} ${number}`,
			subscriptions: maybeSubscription ? [maybeSubscription] : [],
		});
	});
