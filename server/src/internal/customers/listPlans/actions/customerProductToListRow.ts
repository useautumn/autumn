import {
	cusProductToPlanStatus,
	type FullCusProduct,
	type PurchaseListRow,
	type Subscription,
	type SubscriptionListRow,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getApiSubscription } from "../../cusUtils/apiCusUtils/getApiSubscription/getApiSubscription.js";

export type ListedCustomerProduct = FullCusProduct & {
	customer_public_id: string | null;
};

const listRowOwner = (customerProduct: ListedCustomerProduct) => ({
	customer_id:
		customerProduct.customer_public_id ?? customerProduct.internal_customer_id,
	entity_id: customerProduct.entity_id ?? null,
	created_at: customerProduct.created_at,
});

export const customerProductToSubscriptionRow = async ({
	ctx,
	customerProduct,
	subscriptions,
}: {
	ctx: AutumnContext;
	customerProduct: ListedCustomerProduct;
	subscriptions: Subscription[];
}): Promise<SubscriptionListRow> => {
	const { data } = await getApiSubscription({
		ctx,
		fullCus: { subscriptions },
		cusProduct: customerProduct,
	});
	const { plan: _plan, ...subscription } = data;

	return {
		...subscription,
		status: cusProductToPlanStatus({ status: customerProduct.status }),
		...listRowOwner(customerProduct),
	};
};

export const customerProductToPurchaseRow = async ({
	ctx,
	customerProduct,
}: {
	ctx: AutumnContext;
	customerProduct: ListedCustomerProduct;
}): Promise<PurchaseListRow> => {
	const { data } = await getApiSubscription({
		ctx,
		fullCus: { subscriptions: [] },
		cusProduct: customerProduct,
	});

	return {
		id: data.id,
		plan_id: data.plan_id,
		status: cusProductToPlanStatus({ status: customerProduct.status }),
		expires_at: data.expires_at,
		started_at: data.started_at,
		quantity: data.quantity,
		scope: data.scope,
		...listRowOwner(customerProduct),
	};
};
