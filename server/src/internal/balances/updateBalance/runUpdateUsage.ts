import {
	type CustomerEntitlementFilters,
	cusEntsToGrantedBalance,
	cusEntsToPrepaidQuantity,
	FeatureNotFoundError,
	type FullCustomer,
	fullCustomerToCustomerEntitlements,
	nullish,
	type UpdateBalanceParamsV0,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { getOrCreateCachedFullCustomer } from "@/internal/customers/cusUtils/fullCustomerCacheUtils/getOrCreateCachedFullCustomer.js";
import { buildCustomerEntitlementFilters } from "../utils/buildCustomerEntitlementFilters.js";
import type { FeatureDeduction } from "../utils/types/featureDeduction.js";
import { runRedisUpdateBalanceV2 } from "./runRedisUpdateBalanceV2.js";

/** Computes the target balance for a "set usage" update: grantedBalance + prepaid - usage */
const getUpdateUsageTargetBalance = ({
	fullCustomer,
	featureId,
	entityId,
	usage,
	customerEntitlementFilters,
}: {
	fullCustomer: FullCustomer;
	featureId: string;
	entityId?: string;
	usage: number;
	customerEntitlementFilters?: CustomerEntitlementFilters;
}) => {
	const cusEnts = fullCustomerToCustomerEntitlements({
		fullCustomer,
		featureId,
		entity: fullCustomer.entity,
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

/** Updates balance by setting usage to an exact value. Computes targetBalance = grantedBalance + prepaid - usage. */
export const runUpdateUsage = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateBalanceParamsV0;
}) => {
	const { features } = ctx;
	const { feature_id: featureId, usage } = params;

	const feature = features.find((f) => f.id === featureId);
	if (!feature) {
		throw new FeatureNotFoundError({ featureId });
	}

	const customerEntitlementFilters = buildCustomerEntitlementFilters({
		params,
	});

	const fullCustomer = await getOrCreateCachedFullCustomer({
		ctx,
		params,
		source: "runUpdateUsage",
	});

	const targetBalance = getUpdateUsageTargetBalance({
		fullCustomer,
		featureId,
		entityId: params.entity_id,
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

	const result = await runRedisUpdateBalanceV2({
		ctx,
		fullCustomer,
		featureDeductions,
		customerEntitlementFilters,
	});

	return result;
};
