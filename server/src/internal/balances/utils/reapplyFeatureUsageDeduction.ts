import { findFeatureById } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction";
import { CusService } from "@/internal/customers/CusService";

/**
 * Re-applies a feature's total usage across a customer's balances after those
 * balances have been mutated (e.g. a balance was deleted or reset). Reloads the
 * customer to capture the mutated state, then redistributes the usage across the
 * remaining entitlements in priority order, allowing overage.
 */
export const reapplyFeatureUsageDeduction = async ({
	ctx,
	customerId,
	entityId,
	featureId,
	usage,
}: {
	ctx: AutumnContext;
	customerId: string;
	entityId?: string;
	featureId: string;
	usage: number;
}): Promise<void> => {
	if (usage === 0) {
		return;
	}
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		entityId,
		withEntities: true,
		withSubs: true,
	});
	const feature = findFeatureById({
		features: ctx.features,
		featureId,
		errorOnNotFound: true,
	});
	await executePostgresDeduction({
		ctx,
		fullCustomer,
		customerId: fullCustomer.id ?? customerId,
		entityId,
		deductions: [{ feature, deduction: usage }],
		options: {
			alterGrantedBalance: false,
			overageBehaviour: "allow",
		},
	});
};
