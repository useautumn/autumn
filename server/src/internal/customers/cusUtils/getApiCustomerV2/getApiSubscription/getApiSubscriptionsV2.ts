import {
	type ApiSubscriptionV1,
	apiSubscription,
	type CusProductLegacyData,
	type FullSubject,
	fullSubjectToApiCustomerProducts,
	isCustomerProductOneOff,
} from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubscriptionV2 } from "./getApiSubscriptionV2.js";

export const getApiSubscriptionsV2 = async ({
	ctx,
	fullSubject,
}: {
	ctx: RequestContext;
	fullSubject: FullSubject;
}) => {
	const apiSubscriptions: ApiSubscriptionV1[] = [];
	const apiPurchasesAsSubscriptions: ApiSubscriptionV1[] = [];
	const customerProducts = fullSubjectToApiCustomerProducts({
		fullSubject,
	});
	const legacyData: Record<string, CusProductLegacyData> = {};

	for (const customerProduct of customerProducts) {
		const { data, legacyData: customerProductLegacyData } =
			await getApiSubscriptionV2({
				ctx,
				fullSubject,
				customerProduct,
			});

		if (isCustomerProductOneOff(customerProduct)) {
			apiPurchasesAsSubscriptions.push(data);
		} else {
			apiSubscriptions.push(data);
		}

		legacyData[data.plan_id] = customerProductLegacyData;
	}

	return {
		subscriptions: apiSubscriptions,
		purchases: apiPurchasesAsSubscriptions.map((subscription) =>
			apiSubscription.map.v1ToPurchaseV0({
				apiSubscriptionV1: subscription,
			}),
		),
		legacyData,
	};
};
