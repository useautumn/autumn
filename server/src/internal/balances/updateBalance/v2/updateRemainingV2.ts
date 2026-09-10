import {
	FeatureNotFoundError,
	type FullSubject,
	notNullish,
	tryCatch,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { syncItemV4 } from "@/internal/balances/utils/sync/syncItemV4.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handleUpdateBalanceDeductionErrorV2 } from "./handleUpdateBalanceDeductionErrorV2.js";

/** Updates remaining balance using the FullSubject cache path. */
export const updateRemainingV2 = async ({
	ctx,
	fullSubject,
	params,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	params: UpdateBalanceParamsV0;
}) => {
	const { features } = ctx;
	const { feature_id: featureId, add_to_balance: addToBalance } = params;
	const targetBalance = params.remaining ?? params.current_balance;

	const feature = features.find((f) => f.id === featureId);
	if (!feature) throw new FeatureNotFoundError({ featureId });

	const customerEntitlementFilters = buildCustomerEntitlementFilters({
		params,
	});

	const featureDeductions: FeatureDeduction[] = [
		{
			feature,
			deduction: notNullish(addToBalance) ? -addToBalance : 0,
			targetBalance: notNullish(targetBalance) ? targetBalance : undefined,
		},
	];

	const entityId = fullSubject.entityId;

	// add_to_balance is a manual grant: record it in the granted level
	// (adjustment) so the refund ceiling in track covers it. Setting
	// remaining/current_balance stays a usage edit and leaves the granted
	// level untouched.
	const alterGrantedBalance = notNullish(addToBalance);

	const { data: result, error } = await tryCatch(
		executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId,
			deductions: featureDeductions,
			deductionOptions: {
				overageBehaviour: "allow",
				customerEntitlementFilters,
				alterGrantedBalance,
			},
		}),
	);

	if (error) {
		return handleUpdateBalanceDeductionErrorV2({
			ctx,
			error,
			fullSubject,
			featureDeductions,
			customerEntitlementFilters,
			alterGrantedBalance,
		});
	}

	const { rolloverUpdates, modifiedCusEntIdsByFeatureId, usageWindowUpdates } =
		result;
	const cusEntIds = Object.values(modifiedCusEntIdsByFeatureId).flat();
	const rolloverIds = Object.keys(rolloverUpdates);

	if (
		cusEntIds.length > 0 ||
		rolloverIds.length > 0 ||
		usageWindowUpdates.length > 0
	) {
		await syncItemV4({
			ctx,
			payload: {
				customerId: fullSubject.customerId,
				orgId: ctx.org.id,
				env: ctx.env,
				timestamp: Date.now(),
				rolloverIds,
				entityId: fullSubject.entityId,
				modifiedCusEntIdsByFeatureId,
				usageWindowUpdates,
			},
		});
	}

	return result;
};
