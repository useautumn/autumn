import { expect } from "bun:test";
import type { DbPooledBalance } from "@autumn/shared";
import { getPooledBalanceDbState } from "@tests/integration/billing/pooled-balances/utils/getPooledBalanceDbState.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const expectLicensePooledIdentityCorrect = async ({
	ctx,
	customerId,
	customerLicenseLinkId,
	previousPool,
}: {
	ctx: AutumnContext;
	customerId: string;
	customerLicenseLinkId: string;
	previousPool?: DbPooledBalance;
}) => {
	const { pools } = await getPooledBalanceDbState({ db: ctx.db, customerId });
	expect(pools).toHaveLength(1);
	const [pool] = pools;
	expect(pool).toMatchObject({
		customer_license_link_id: customerLicenseLinkId,
		expires_at: null,
	});
	if (previousPool) {
		expect(pool).toMatchObject({
			id: previousPool.id,
			customer_entitlement_id: previousPool.customer_entitlement_id,
			reset_cycle_anchor: previousPool.reset_cycle_anchor,
		});
	}
	return pool;
};
