import type {
	AggregatedCustomerEntitlement,
	CusProductStatus,
	DbCustomer,
	DbCustomerEntitlement,
	DbCustomerPrice,
	DbCustomerProduct,
	DbEntitlement,
	DbFeature,
	DbFreeTrial,
	DbPrice,
	DbProduct,
	DbRollover,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { RELEVANT_STATUSES } from "../cusProducts/CusProductService.js";

export { resultToFullCustomer } from "./getFullCustomerV2/resultToFullCustomer.js";

import { getSubjectCoreQuery } from "./sql/getSubjectCoreQuery.js";

type EntitlementWithFeatureRow = DbEntitlement & {
	feature: DbFeature;
};

export interface EntityAggregations {
	aggregated_customer_products: DbCustomerProduct[];
	aggregated_customer_entitlements: AggregatedCustomerEntitlement[];
	aggregated_customer_prices: DbCustomerPrice[];
}

/**
 * Raw row shape returned by getSubjectCore query.
 * Each field is a JSON column from the SQL result.
 */
export interface SubjectCoreRow {
	customer: DbCustomer;
	customer_products: DbCustomerProduct[];
	customer_entitlements: DbCustomerEntitlement[];
	customer_prices: DbCustomerPrice[];
	extra_customer_entitlements: DbCustomerEntitlement[];
	rollovers: DbRollover[];
	products: DbProduct[];
	entitlements: EntitlementWithFeatureRow[];
	prices: DbPrice[];
	free_trials: DbFreeTrial[];
	entity_aggregations?: EntityAggregations;
}

export async function getFullCustomerV2({
	ctx,
	customerId,
	inStatuses = RELEVANT_STATUSES,
}: {
	ctx: AutumnContext;
	customerId: string;
	inStatuses?: CusProductStatus[];
}): Promise<SubjectCoreRow | null> {
	const { db, org, env } = ctx;

	const query = getSubjectCoreQuery({
		orgId: org.id,
		env,
		customerId,
		inStatuses,
	});

	const result = await db.execute(query);

	if (!result || result.length === 0) return null;

	return result[0] as unknown as SubjectCoreRow;
}

export { getSubjectCoreQuery };
