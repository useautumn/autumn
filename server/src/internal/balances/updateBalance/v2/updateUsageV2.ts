import {
	type CustomerEntitlementFilters,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	FeatureNotFoundError,
	type FullSubject,
	fullSubjectToCustomerEntitlements,
	nullish,
	tryCatch,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { executeRedisDeductionV2 } from "@/internal/balances/utils/deductionV2/executeRedisDeductionV2.js";
import { globalSyncBatchingManagerV3 } from "@/internal/balances/utils/sync/SyncBatchingManagerV3.js";
import { buildCustomerEntitlementFilters } from "../../utils/buildCustomerEntitlementFilters.js";
import type { FeatureDeduction } from "../../utils/types/featureDeduction.js";
import { handleUpdateBalanceDeductionErrorV2 } from "./handleUpdateBalanceDeductionErrorV2.js";

const getUpdateUsageTargetBalance = ({
	fullSubject,
	featureId,
	entityId,
	usage,
	customerEntitlementFilters,
}: {
	fullSubject: FullSubject;
	featureId: string;
	entityId?: string;
	usage: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullSubjectToCustomerEntitlements({
		fullSubject,
		featureIds: [featureId],
		customerEntitlementFilters,
	});

	const grantedBalance = cusEntsToGrantedBalance({
		cusEnts,
		entityId,
	});

	const prepaidQuantity = cusEntsToPrepaidQuantity({
		cusEnts,
		sumAcrossEntities: nullish(entityId),
	});

	return new Decimal(grantedBalance).add(prepaidQuantity).sub(usage).toNumber();
};

/** Updates balance by setting usage to an exact value, using the FullSubject cache path. */
export const updateUsageV2 = async ({
	ctx,
	fullSubject,
	params,
}: {
	ctx: AutumnContext;
	fullSubject: FullSubject;
	params: UpdateBalanceParamsV0;
}) => {
	const { features } = ctx;
	const { feature_id: featureId, usage } = params;

	const feature = features.find((f) => f.id === featureId);
	if (!feature) throw new FeatureNotFoundError({ featureId });

	const customerEntitlementFilters = buildCustomerEntitlementFilters({
		params,
	});

	const entityId = fullSubject.entityId;

	const targetBalance = getUpdateUsageTargetBalance({
		fullSubject,
		featureId,
		entityId,
		usage: usage!,
		customerEntitlementFilters,
	});

	const featureDeductions: FeatureDeduction[] = [
		{
			feature,
			deduction: 0,
			targetBalance,
		},
	];

	const { data: result, error } = await tryCatch(
		executeRedisDeductionV2({
			ctx,
			fullSubject,
			entityId,
			deductions: featureDeductions,
			deductionOptions: {
				overageBehaviour: "allow",
				customerEntitlementFilters,
				alterGrantedBalance: false,
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
		});
	}

	const { rolloverUpdates, modifiedCusEntIdsByFeatureId } = result;
	const cusEntIds = Object.values(modifiedCusEntIdsByFeatureId).flat();
	const rolloverIds = Object.keys(rolloverUpdates);

	if (cusEntIds.length > 0 || rolloverIds.length > 0) {
		globalSyncBatchingManagerV3.addSyncItem({
			customerId: fullSubject.customerId,
			orgId: ctx.org.id,
			env: ctx.env,
			cusEntIds,
			rolloverIds,
			entityId: fullSubject.entityId,
			modifiedCusEntIdsByFeatureId,
		});
	}

	return result;
};
