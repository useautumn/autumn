import {
	EntInterval,
	type EntitlementWithFeature,
	type Feature,
} from "@autumn/shared";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { cycleAnchorSourcesSql } from "@/internal/migrations/v2/batchOperations/actions/utils/cycleAnchorSql.js";
import {
	buildLiveFilterCandidateQuery,
	LiveFilterCandidateCoreSchema,
	nullableNumeric,
	toLiveFilterCandidateRow,
} from "@/internal/migrations/v2/batchOperations/actions/utils/liveFilterCandidateSql.js";
import type { OperationScope } from "@/internal/migrations/v2/batchOperations/scope/operationScope.js";
import type { EntitlementPriceFilter } from "@/internal/migrations/v2/batchOperations/types/entitlementPriceFilter.js";
import type { CycleEnrichmentCandidate } from "@/internal/migrations/v2/batchOperations/utils/enrichCustomerEntitlementCycles.js";

const ReplaceCandidateRowSchema = LiveFilterCandidateCoreSchema.extend({
	customerId: z.string().nullable(),
	isPaidRecurring: z.boolean(),
	billingCycleAnchor: nullableNumeric,
	subscriptionCycleAnchor: nullableNumeric,
	siblingResetCycleAnchor: nullableNumeric,
});

export type ReplaceCandidateRow = CycleEnrichmentCandidate & {
	customerEntitlementId: string;
	liveBalance: number | null;
	liveNextResetAt: number | null;
	liveDefinition?: EntitlementWithFeature;
};

type SelectReplaceCandidateRowsArgs = {
	internalCustomerIds: string[];
	scope: OperationScope;
	/** The minted to-entitlement; drives the sibling anchor's interval match. */
	entitlement: EntitlementWithFeature;
	filter: EntitlementPriceFilter;
	excludeEntitlementId: string;
	features: Feature[];
	includeAnchorSources: boolean;
	afterCustomerProductId?: string;
	limit: number;
};

/** Selects scoped live from-rows matching the compiled filter and cycle anchors. */
export const buildReplaceCandidateRowsQuery = ({
	internalCustomerIds,
	scope,
	entitlement,
	filter,
	excludeEntitlementId,
	includeAnchorSources,
	afterCustomerProductId,
	limit,
}: SelectReplaceCandidateRowsArgs) => {
	const targetInterval = String(entitlement.interval ?? EntInterval.Lifetime);
	const targetIntervalCount = entitlement.interval_count ?? 1;
	const anchors = cycleAnchorSourcesSql({
		include: includeAnchorSources,
		customerProductId: sql`cp.id`,
		subscriptionIds: sql`cp.subscription_ids`,
		targetInterval,
		targetIntervalCount,
		keepLiveRowAnchor: true,
	});

	return buildLiveFilterCandidateQuery({
		internalCustomerIds,
		scope,
		filter,
		extraSelect: sql`,
			customer.id AS "customerId",
			${anchors.paidRecurringColumn} AS "isPaidRecurring",
			cp.billing_cycle_anchor AS "billingCycleAnchor",
			${anchors.subscriptionAnchorColumn} AS "subscriptionCycleAnchor",
			${anchors.siblingAnchorColumn} AS "siblingResetCycleAnchor"
		`,
		extraJoins: sql`
			INNER JOIN customers AS customer
				ON customer.internal_id = cp.internal_customer_id
			${anchors.siblingJoin}
			${anchors.subscriptionJoin}
		`,
		extraWhere: sql`AND live.entitlement_id <> ${excludeEntitlementId}`,
		afterCustomerProductId,
		limit,
	});
};

export const selectReplaceCandidateRows = async ({
	db,
	...args
}: SelectReplaceCandidateRowsArgs & {
	db: DrizzleCli;
}): Promise<ReplaceCandidateRow[]> => {
	if (args.internalCustomerIds.length === 0) return [];

	const rows = await db.execute(buildReplaceCandidateRowsQuery(args));

	return rows.map((row) => {
		const parsed = ReplaceCandidateRowSchema.parse(row);
		const live = toLiveFilterCandidateRow({
			parsed,
			features: args.features,
		});
		return {
			...live,
			customerId: parsed.customerId,
			isPaidRecurring: parsed.isPaidRecurring,
			billingCycleAnchor: parsed.billingCycleAnchor,
			subscriptionCycleAnchor: parsed.subscriptionCycleAnchor,
			siblingResetCycleAnchor: parsed.siblingResetCycleAnchor,
		};
	});
};
