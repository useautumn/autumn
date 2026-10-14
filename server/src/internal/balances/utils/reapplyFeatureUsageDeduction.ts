import { findFeatureById } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { executePostgresDeduction } from "@/internal/balances/utils/deduction/executePostgresDeduction";
import { CusService } from "@/internal/customers/CusService";

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
