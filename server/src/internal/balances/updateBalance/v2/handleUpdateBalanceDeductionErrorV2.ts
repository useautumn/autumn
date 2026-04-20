import type { CustomerEntitlementFilters, FullSubject } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executePostgresDeductionV2 } from "@/internal/balances/utils/deductionV2/executePostgresDeductionV2.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { RedisDeductionError } from "../../utils/types/redisDeductionError.js";

/** Handles Redis deduction errors for update balance V2. Falls back to Postgres when recoverable. */
export const handleUpdateBalanceDeductionErrorV2 = async ({
	ctx,
	error,
	fullSubject,
	featureDeductions,
	customerEntitlementFilters,
}: {
	ctx: AutumnContext;
	error: Error;
	fullSubject: FullSubject;
	featureDeductions: FeatureDeduction[];
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	if (!(error instanceof RedisDeductionError) || !error.shouldFallback())
		throw error;

	ctx.logger.info(`[updateBalanceV2] Falling back to Postgres (${error.code})`);

	await executePostgresDeductionV2({
		ctx,
		fullSubject,
		customerId: fullSubject.customerId,
		entityId: fullSubject.entityId,
		deductions: featureDeductions,
		options: {
			overageBehaviour: "allow",
			customerEntitlementFilters,
			alterGrantedBalance: false,
		},
	});
};
