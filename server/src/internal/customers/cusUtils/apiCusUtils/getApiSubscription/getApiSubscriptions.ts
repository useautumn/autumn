import {
	type ApiSubscriptionV1,
	apiSubscription,
	type CusProductLegacyData,
	type FullCustomer,
	isCustomerProductOneOff,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubscription } from "./getApiSubscription.js";

export const getApiSubscriptions = async ({
	ctx,
	fullCus,
	expandParams,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
	expandParams?: { plan?: boolean };
}) => {
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

	const purchases = apiPurchasesAsSubscriptions.map((sub) =>
		apiSubscription.map.v1ToPurchaseV0({
			apiSubscriptionV1: sub,
		}),
	);

	return {
		subscriptions: apiSubs,
		purchases,
		legacyData,
	};
};
