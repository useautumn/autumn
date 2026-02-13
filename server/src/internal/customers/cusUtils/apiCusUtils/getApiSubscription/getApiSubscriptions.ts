import {
	ACTIVE_STATUSES,
	type ApiSubscriptionV1,
	apiSubscription,
	type CusProductLegacyData,
	type CusProductStatus,
	type FullCustomer,
	isCustomerProductOneOff,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubscription } from "./getApiSubscription.js";

const getSubscriptionStatusKey = (cp: ApiSubscriptionV1) => {
	if (!("status" in cp)) return undefined;
	if (ACTIVE_STATUSES.includes(cp.status as CusProductStatus)) return "active";
	return cp.status;
};

const mergeSubscriptionsResponses = ({
	subscriptions,
}: {
	subscriptions: ApiSubscriptionV1[];
}) => {
	const getPlanKey = (cp: ApiSubscriptionV1) => {
		return `${cp.plan_id}:${getSubscriptionStatusKey(cp)}`;
	};

	const record: Record<string, ApiSubscriptionV1> = {};

	for (const curr of subscriptions) {
		const key = getPlanKey(curr);
		const latest = record[key];

		const currStartedAt = curr.started_at;

		const curCanceledAt = "canceled_at" in curr ? curr.canceled_at : null;
		const curQuantity = "quantity" in curr ? curr.quantity : 0;

		record[key] = {
			...(latest || curr),
			canceled_at: curCanceledAt ? curCanceledAt : latest?.canceled_at || null,
			started_at: latest?.started_at
				? Math.min(latest?.started_at, currStartedAt)
				: currStartedAt,
			quantity: (latest?.quantity || 0) + curQuantity,
		};
	}

	return Object.values(record);
};

export const getApiSubscriptions = async ({
	ctx,
	fullCus,
	expandParams,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	expandParams?: { plan?: boolean };
}) => {
	// Process full subscriptions
	const apiSubs: ApiSubscriptionV1[] = [];
	const apiPurchasesAsSubscriptions: ApiSubscriptionV1[] = [];

	const cusProducts = fullCus.customer_products;

	const legacyData: Record<string, CusProductLegacyData> = {};
	for (const cusProduct of cusProducts) {
		const processed = await getApiSubscription({
			cusProduct,
			ctx,
			fullCus,
			expandParams,
		});

		if (isCustomerProductOneOff(cusProduct)) {
			apiPurchasesAsSubscriptions.push(processed.data);
		} else {
			apiSubs.push(processed.data);
		}
		legacyData[processed.data.plan_id] = processed.legacyData;
	}

	const merged = mergeSubscriptionsResponses({
		subscriptions: apiSubs,
	});

	const mergedPurchasesAsSubscriptions = mergeSubscriptionsResponses({
		subscriptions: apiPurchasesAsSubscriptions,
	});

	const mergedPurchases = mergedPurchasesAsSubscriptions.map((sub) =>
		apiSubscription.map.v1ToPurchaseV0({
			apiSubscriptionV1: sub,
		}),
	);

	return {
		subscriptions: merged,
		purchases: mergedPurchases,
		legacyData,
	};
};
