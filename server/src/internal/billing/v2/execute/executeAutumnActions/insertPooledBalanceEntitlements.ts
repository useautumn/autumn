import type { PooledBalancePlan } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService";

export const insertPooledBalanceEntitlements = async ({
	ctx,
	pooledBalancePlan,
}: {
	ctx: AutumnContext;
	pooledBalancePlan: PooledBalancePlan | undefined;
}): Promise<void> => {
	const entitlements = (pooledBalancePlan?.insertPoolBalances ?? []).map(
		({ entitlement: { feature: _feature, ...entitlement } }) => entitlement,
	);
	if (entitlements.length === 0) return;
	await EntitlementService.insert({ db: ctx.db, data: entitlements });
};
