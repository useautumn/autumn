import type {
	BinSizeEnum,
	CustomerEntitlement,
	DeductionBalance,
	DeductionFeature,
	DeductionPeriod,
	FeatureType,
	FullCustomer,
	RangeEnum,
} from "@autumn/shared";
import { isAnyCreditSystem, notNullish } from "@autumn/shared";
import { UTCDate } from "@date-fns/utc";
import type { AggregateDeductionsPipeRow } from "@/external/tinybird/initTinybird.js";
import { getTinybirdPipes } from "@/external/tinybird/initTinybird.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { getCreditCost } from "@/internal/features/creditSystemUtils.js";
import { calculateDateRange } from "./aggregate.js";

/** The pipe buckets overflow groups here; the API surfaces the same label as the grouped list. */
const RESERVED_GROUP = "AUTUMN_RESERVED";
const OTHER_GROUP = "Other";

type GroupColumn = "entity_id" | "source_feature_id" | "plan_id";

/** isAnyCreditSystem narrows a required FeatureType; lookups here can miss. */
const isCreditSystemFeature = (type?: FeatureType): boolean =>
	type !== undefined && isAnyCreditSystem(type);

/**
 * Maps group_by onto the pipe's group_column. The external API sends
 * `$`-prefixed names; the dashboard's internal endpoint sends them bare —
 * accept both so one action serves both callers.
 */
const toGroupColumn = (groupBy?: string): GroupColumn | undefined => {
	const bare = groupBy?.startsWith("$") ? groupBy.slice(1) : groupBy;
	if (
		bare === "entity_id" ||
		bare === "source_feature_id" ||
		bare === "plan_id"
	) {
		return bare;
	}
	return undefined;
};

/**
 * Every customer_entitlement the customer owns, flattened across plans, loose
 * balances and pooled balances — the deduction's `balance_id` can point at any of them.
 *
 * Carries the OWNING PRODUCT's entity down with each row. Attaching a plan to an
 * entity stamps `internal_entity_id` on the customer_product, not on the
 * entitlements beneath it, so reading the entitlement's own column alone reports
 * null for every entity-scoped seat balance.
 */
/** What pivotRows needs to know about a balance's owning entitlement. */
type BalanceOwner = {
	cusEnt: Pick<CustomerEntitlement, "id" | "next_reset_at">;
	internalEntityId: string | null;
};

const collectCustomerEntitlements = ({
	customer,
}: {
	customer: FullCustomer;
}): BalanceOwner[] => [
	...customer.customer_products.flatMap((product) =>
		(product.customer_entitlements ?? []).map((cusEnt) => ({
			cusEnt,
			internalEntityId:
				cusEnt.internal_entity_id ?? product.internal_entity_id ?? null,
		})),
	),
	...(customer.extra_customer_entitlements ?? []).map((cusEnt) => ({
		cusEnt,
		internalEntityId: cusEnt.internal_entity_id ?? null,
	})),
	...(customer.pooled_customer_entitlements ?? []).map((cusEnt) => ({
		cusEnt,
		internalEntityId: cusEnt.internal_entity_id ?? null,
	})),
];

/**
 * Resolves the three fields Tinybird cannot supply, because they are not stored on
 * the deduction: the balance's owning entity, its next reset, and whether the
 * balance-owning feature is metered or a credit system.
 */
const buildBalanceLookups = ({
	ctx,
	customer,
}: {
	ctx: AutumnContext;
	customer: FullCustomer;
}) => {
	const entityIdByInternalId = new Map<string, string>();
	for (const entity of customer.entities ?? []) {
		if (entity.internal_id && entity.id) {
			entityIdByInternalId.set(entity.internal_id, entity.id);
		}
	}

	const cusEntById = new Map(
		collectCustomerEntitlements({ customer }).map((entry) => [
			entry.cusEnt.id,
			entry,
		]),
	);

	const featureById = new Map(
		ctx.features.map((feature) => [feature.id, feature]),
	);

	return { entityIdByInternalId, cusEntById, featureById };
};

/**
 * The rate applied converting the tracked feature into this balance.
 *
 * Only resolvable when the caller pinned a single source feature — with several
 * sources feeding one pool they each convert at a different rate, so a single
 * number would be a lie. Reflects the CURRENT credit schema, not the rate at
 * deduction time: credit systems are edited in place rather than versioned.
 */
const resolveCreditCost = ({
	ctx,
	sourceFeatureId,
	balanceFeatureId,
}: {
	ctx: AutumnContext;
	sourceFeatureId?: string;
	balanceFeatureId: string;
}): number | null => {
	if (!sourceFeatureId || sourceFeatureId === balanceFeatureId) return null;

	const creditSystem = ctx.features.find((f) => f.id === balanceFeatureId);
	if (!creditSystem || !isAnyCreditSystem(creditSystem.type)) return null;

	try {
		return getCreditCost({
			featureId: sourceFeatureId,
			creditSystem,
			amount: 1,
		});
	} catch {
		// Feature is not in the schema (schema edited since). Better null than wrong.
		return null;
	}
};

export const aggregateDeductions = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: {
		customer: FullCustomer;
		customerId: string;
		entityId?: string;
		featureIds: string[];
		groupBy?: string;
		interval?: RangeEnum;
		customRange?: { start: number; end: number };
		binSize: BinSizeEnum;
		maxGroups?: number;
		timezone?: string;
	};
}): Promise<DeductionPeriod[]> => {
	const { startDate, endDate } = await calculateDateRange({
		ctx,
		params: {
			event_names: params.featureIds,
			customer_id: params.customerId,
			bin_size: params.binSize,
			interval: params.interval,
			custom_range: params.customRange,
			customer: params.customer,
			aggregateAll: false,
		},
	});

	const groupColumn = toGroupColumn(params.groupBy);
	// "properties.foo" (dashboard) / "$properties.foo" never map to a column —
	// they route the pipe to its raw-events branch, which can read properties.
	const bareGroupBy = params.groupBy?.startsWith("$")
		? params.groupBy.slice(1)
		: params.groupBy;
	const propertyKey = bareGroupBy?.startsWith("properties.")
		? bareGroupBy.slice("properties.".length)
		: undefined;

	const { data: rows } = await getTinybirdPipes().aggregateDeductions({
		org_id: ctx.org.id,
		env: ctx.env,
		customer_id: params.customerId,
		start_date: startDate,
		end_date: endDate,
		bin_size: params.binSize,
		timezone: params.timezone ?? "UTC",
		feature_ids: params.featureIds.length > 0 ? params.featureIds : undefined,
		entity_id: params.entityId,
		group_column: groupColumn,
		property_key: propertyKey,
		max_groups: params.maxGroups,
	});

	if (!rows || rows.length === 0) return [];

	const { entityIdByInternalId, cusEntById, featureById } = buildBalanceLookups(
		{
			ctx,
			customer: params.customer,
		},
	);

	// FullCustomer omits entity-attached (seat) products at the customer level,
	// and expired products entirely — resolve those balances by id instead.
	const unresolvedBalanceIds = [
		...new Set(rows.map((row) => row.balance_id)),
	].filter((balanceId) => !cusEntById.has(balanceId));
	const fetched = await CusEntService.getByIdsWithProductEntity({
		db: ctx.db,
		ids: unresolvedBalanceIds,
		internalCustomerId: params.customer.internal_id,
	});
	for (const { cusEnt, productInternalEntityId } of fetched) {
		cusEntById.set(cusEnt.id, {
			cusEnt,
			internalEntityId:
				cusEnt.internal_entity_id ?? productInternalEntityId ?? null,
		});
	}

	// Only a single non-credit-system source has an unambiguous conversion rate.
	const pinnedSource =
		params.featureIds.length === 1 &&
		!isCreditSystemFeature(featureById.get(params.featureIds[0])?.type)
			? params.featureIds[0]
			: undefined;

	return pivotRows({
		rows,
		ctx,
		grouped: groupColumn !== undefined || propertyKey !== undefined,
		groupColumn,
		pinnedSource,
		entityIdByInternalId,
		cusEntById,
		featureById,
	});
};

/**
 * Flat pipe rows -> periods of values{} / balances[] / grouped_values{}.
 *
 * `values` sums across group values, `balances` sums per balance, and
 * `grouped_values` keeps the split — all three from the same rows, so they
 * reconcile by construction.
 */
const pivotRows = ({
	rows,
	ctx,
	grouped,
	groupColumn,
	pinnedSource,
	entityIdByInternalId,
	cusEntById,
	featureById,
}: {
	rows: AggregateDeductionsPipeRow[];
	ctx: AutumnContext;
	grouped: boolean;
	groupColumn?: GroupColumn;
	pinnedSource?: string;
	entityIdByInternalId: Map<string, string>;
	cusEntById: Map<string, BalanceOwner>;
	featureById: Map<string, { id: string; type: FeatureType }>;
}): DeductionPeriod[] => {
	const byPeriod = new Map<number, DeductionPeriod>();
	// Balance accumulators, keyed period -> feature -> balance_id.
	const balanceAcc = new Map<string, DeductionBalance>();

	for (const row of rows) {
		const period = new UTCDate(row.period).getTime();

		let periodEntry = byPeriod.get(period);
		if (!periodEntry) {
			periodEntry = { period, values: {} };
			byPeriod.set(period, periodEntry);
		}

		const balanceFeatureId = row.balance_feature_id;
		const feature = featureById.get(balanceFeatureId);

		let featureEntry: DeductionFeature | undefined =
			periodEntry.values[balanceFeatureId];
		if (!featureEntry) {
			featureEntry = {
				feature_type: isCreditSystemFeature(feature?.type)
					? "credit_system"
					: "metered",
				deducted: 0,
				events: 0,
				balances: [],
			};
			periodEntry.values[balanceFeatureId] = featureEntry;
		}

		featureEntry.deducted += row.deducted;
		featureEntry.events += row.deduction_count;

		const balanceKey = `${period}::${balanceFeatureId}::${row.balance_id}`;
		let balance = balanceAcc.get(balanceKey);
		if (!balance) {
			const entry = cusEntById.get(row.balance_id);
			const cusEnt = entry?.cusEnt;
			const internalEntityId = entry?.internalEntityId ?? null;

			balance = {
				balance_id: row.balance_id,
				entity_id: internalEntityId
					? (entityIdByInternalId.get(internalEntityId) ?? null)
					: null,
				plan_id: row.plan_id === "" ? null : row.plan_id,
				reset:
					row.reset_interval === ""
						? null
						: {
								interval: row.reset_interval,
								resets_at: notNullish(cusEnt?.next_reset_at)
									? Number(cusEnt?.next_reset_at)
									: null,
							},
				credit_cost: resolveCreditCost({
					ctx,
					sourceFeatureId: pinnedSource,
					balanceFeatureId,
				}),
				deducted: 0,
				events: 0,
			};
			balanceAcc.set(balanceKey, balance);
			featureEntry.balances.push(balance);
		}

		balance.deducted += row.deducted;
		balance.events += row.deduction_count;

		if (!grouped) continue;

		// Grouped split lives under the balance, because attributing a shared
		// balance to whoever spent from it needs balance x group, not group alone.
		periodEntry.grouped_values ??= {};
		periodEntry.grouped_values[row.balance_id] ??= {};
		const forBalance = periodEntry.grouped_values[row.balance_id];
		const groupValue =
			row.group_value === RESERVED_GROUP ? OTHER_GROUP : row.group_value;

		const existing = forBalance[groupValue];
		if (existing) {
			existing.deducted += row.deducted;
			continue;
		}

		forBalance[groupValue] = {
			deducted: row.deducted,
			// Grouping BY the source feature makes each group a real source x balance
			// pair, so the rate is exact here even when the balance-level one is null.
			...(groupColumn === "source_feature_id" && groupValue !== OTHER_GROUP
				? {
						credit_cost: resolveCreditCost({
							ctx,
							sourceFeatureId: groupValue,
							balanceFeatureId,
						}),
					}
				: {}),
		};
	}

	return [...byPeriod.values()].sort((a, b) => a.period - b.period);
};
