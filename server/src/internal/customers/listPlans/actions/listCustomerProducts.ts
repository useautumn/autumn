import {
	CustomerWalkCursor,
	type ListPage,
	type ListSubscriptionsParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { SubService } from "@/internal/subscriptions/SubService.js";
import { assembleCustomerWalkPage } from "../../customerWalk/assembleCustomerWalkPage.js";
import { findCustomerWalkBoundary } from "../../customerWalk/findCustomerWalkBoundary.js";
import { getListScanCap } from "../../customerWalk/getListScanCap.js";
import { resolveListScope } from "../../customerWalk/resolveListScope.js";
import { normalizeCustomerProductTimeFields } from "../../reassembleFlattenedCustomer/normalizeFields.js";
import {
	type CustomerProductListKind,
	listCustomerProductRowsQuery,
} from "../repos/listCustomerProductRowsQuery.js";
import type { ListedCustomerProduct } from "./customerProductToListRow.js";
import { subscriptionListStatusesToDb } from "./subscriptionListStatusesToDb.js";

/** A page of hydrated customer_products for subscriptions.list / purchases.list. */
export const listCustomerProducts = async ({
	ctx,
	params,
	kind,
}: {
	ctx: AutumnContext;
	params: ListSubscriptionsParams;
	kind: CustomerProductListKind;
}): Promise<ListPage<ListedCustomerProduct>> => {
	const scope = await resolveListScope({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id,
	});
	const cursor = CustomerWalkCursor.decode(params.start_cursor);
	const walksCustomers = !scope.internalCustomerId && !params.plan_id;

	const boundaryCustomerId = walksCustomers
		? await findCustomerWalkBoundary({
				ctx,
				cursor,
				scanCap: getListScanCap({ ctx }),
			})
		: null;

	const rows = (await ctx.db.execute(
		listCustomerProductRowsQuery({
			ctx,
			scope,
			kind,
			dbStatuses: subscriptionListStatusesToDb({ statuses: params.statuses }),
			planId: params.plan_id,
			cursor,
			boundaryCustomerId,
			limit: params.limit,
		}),
	)) as unknown as ListedCustomerProduct[];

	for (const row of rows) {
		normalizeCustomerProductTimeFields(row);
		row.customer_prices ??= [];
		row.customer_entitlements ??= [];
	}

	return assembleCustomerWalkPage({
		rows,
		limit: params.limit,
		boundaryCustomerId,
		toWalkRow: (row) => ({
			internalCustomerId: row.internal_customer_id,
			createdAt: row.created_at,
			id: row.id,
		}),
		toItem: (row) => row,
	});
};

/** Stripe-backed period data for the page's subscriptions, in one read. */
export const loadPageSubscriptions = async ({
	ctx,
	customerProducts,
}: {
	ctx: AutumnContext;
	customerProducts: ListedCustomerProduct[];
}) => {
	const stripeIds = customerProducts.flatMap(
		(customerProduct) => customerProduct.subscription_ids ?? [],
	);
	if (stripeIds.length === 0) return [];
	return SubService.getInStripeIds({ db: ctx.db, ids: stripeIds });
};
