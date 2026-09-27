import { expect } from "bun:test";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import { getLicenseDbState } from "@tests/integration/licenses/licenseTestUtils.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const getLicensePooledBatchState = async ({
	ctx,
	customerId,
}: {
	ctx: AutumnContext;
	customerId: string;
}) => {
	const [pooled, licenses] = await Promise.all([
		getPooledBalanceDbState({ db: ctx.db, customerId }),
		getLicenseDbState({ db: ctx.db, customerId }),
	]);
	const byId = (left: { id: string }, right: { id: string }) =>
		left.id.localeCompare(right.id);
	return {
		pools: pooled.pools.sort(byId),
		contributions: pooled.contributions.sort(byId),
		poolCustomerEntitlements: pooled.poolCustomerEntitlements
			.map((entitlement) => ({
				...entitlement,
				rollovers: entitlement.rollovers.sort(byId),
			}))
			.sort(byId),
		sourceCustomerProducts: pooled.sourceCustomerProducts
			.map((product) => ({
				...product,
				customer_entitlements: product.customer_entitlements.sort(byId),
			}))
			.sort(byId),
		customerLicenses: licenses.pools.sort(byId),
		assignments: licenses.assignments.sort(byId),
	};
};

export const expectLicensePooledBatchStateUnchanged = async ({
	ctx,
	customerId,
	before,
}: {
	ctx: AutumnContext;
	customerId: string;
	before: Awaited<ReturnType<typeof getLicensePooledBatchState>>;
}) => {
	const after = await getLicensePooledBatchState({ ctx, customerId });
	expect(after).toEqual(before);
};
