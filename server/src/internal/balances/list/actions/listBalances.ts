import {
	type BalanceListRow,
	CustomerWalkCursor,
	type ListBalancesParams,
	type ListPage,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { assembleCustomerWalkPage } from "@/internal/customers/customerWalk/assembleCustomerWalkPage.js";
import { findCustomerWalkBoundary } from "@/internal/customers/customerWalk/findCustomerWalkBoundary.js";
import { getListScanCap } from "@/internal/customers/customerWalk/getListScanCap.js";
import { resolveListScope } from "@/internal/customers/customerWalk/resolveListScope.js";
import { listCustomerEntitlementRowsQuery } from "../repos/listCustomerEntitlementRowsQuery.js";
import {
	customerEntitlementToListRow,
	type ListedCustomerEntitlementRow,
} from "./customerEntitlementToListRow.js";

/** A page of balance rows for balances.list, plan-backed and loose. */
export const listBalances = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: ListBalancesParams;
}): Promise<ListPage<BalanceListRow>> => {
	const scope = await resolveListScope({
		ctx,
		customerId: params.customer_id,
		entityId: params.entity_id,
	});
	const cursor = CustomerWalkCursor.decode(params.start_cursor);

	const boundaryCustomerId = scope.internalCustomerId
		? null
		: await findCustomerWalkBoundary({
				ctx,
				cursor,
				scanCap: getListScanCap({ ctx }),
			});

	const rows = (await ctx.db.execute(
		listCustomerEntitlementRowsQuery({
			ctx,
			scope,
			statuses: params.statuses ?? ["active"],
			planId: params.plan_id,
			featureId: params.feature_id,
			cursor,
			boundaryCustomerId,
			limit: params.limit,
			now: Date.now(),
		}),
	)) as unknown as ListedCustomerEntitlementRow[];

	return assembleCustomerWalkPage({
		rows,
		limit: params.limit,
		boundaryCustomerId,
		toWalkRow: (row) => ({
			internalCustomerId: row.internal_customer_id,
			createdAt: Number(row.created_at),
			id: row.id,
		}),
		toItem: (row) => customerEntitlementToListRow({ row }),
	});
};
