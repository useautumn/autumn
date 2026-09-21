import { findUsageWindowByLimit, type UsageWindowLimit } from "@autumn/shared";
import { Decimal } from "decimal.js";
import type { RowChange } from "../../../models/mutation/rowChange.js";
import type { WorkerUsageWindow } from "../../../models/subject/rows/workerUsageWindow.js";
import type { DeductionContext } from "../../types/deductionContext.js";
import type { DeductionDelta } from "../../types/deductionDelta.js";
import type { DeductionRow } from "../../types/deductionRow.js";
import type { DeductionState } from "../../types/deductionState.js";
import { deductionRowToRateUnits } from "../convertDeductionUtils.js";
import { creditRateUnitsForCreditChange } from "../credits/creditRateUnitsForCreditChange.js";

/** The stored counter row for this cap, if it is still counting inside the cap's current window. */
const liveWindowOf = ({
	context,
	limit,
}: {
	context: DeductionContext;
	limit: UsageWindowLimit;
}): WorkerUsageWindow | null => {
	const existing = findUsageWindowByLimit({
		usageWindows: context.usageWindows,
		limit,
	});
	if (
		!existing ||
		existing.window_end_at <= context.now ||
		existing.window_start_at !== limit.window_start_at
	)
		return null;
	return existing;
};

/** A counter only counts inside its stamped window; expired or re-derived bounds read as zero. */
const storedUsageOf = ({
	context,
	limit,
}: {
	context: DeductionContext;
	limit: UsageWindowLimit;
}): Decimal => new Decimal(liveWindowOf({ context, limit })?.usage ?? 0);

const headroomOf = ({
	context,
	deductionState,
	limit,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	limit: UsageWindowLimit;
}): Decimal =>
	Decimal.max(
		new Decimal(limit.limit)
			.minus(storedUsageOf({ context, limit }))
			.minus(deductionState.usageWindowConsumed.get(limit.key) ?? 0),
		0,
	);

/** Does this cap bind a draw from `row`? Metered caps count every row; balance caps only rows of the capped feature. `row` null is the rollover phase. */
const appliesTo = ({
	limit,
	row,
}: {
	limit: UsageWindowLimit;
	row: DeductionRow | null;
}): boolean =>
	limit.dimension_type !== "balance" ||
	(row !== null && row.featureId === limit.feature_id);

/** `get_available_from_usage_windows`: the most tracked units the caps still allow from `row`; null when unbounded. */
export const deductionRowToUsageWindowHeadroom = ({
	context,
	deductionState,
	row,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	row: DeductionRow | null;
}): Decimal | null => {
	let allowed: Decimal | null = null;
	for (const limit of context.usageWindowLimits) {
		if (!appliesTo({ limit, row })) continue;
		const headroom = headroomOf({ context, deductionState, limit });
		// Balance caps are in credits; the row's rate converts them to tracked units.
		const units =
			limit.dimension_type === "balance" && row
				? row.rateCard
					? creditRateUnitsForCreditChange({
							rateCard: row.rateCard,
							currentUnits: deductionRowToRateUnits({
								row,
								deltas: deductionState.deltas,
							}),
							requestedUnits: deductionState.remaining,
							allowedCreditChange: headroom,
						})
					: headroom.div(row.creditCost)
				: headroom;
		if (allowed === null || units.lt(allowed)) allowed = units;
	}
	return allowed;
};

/** `consume_usage_window_headroom`: what a draw took, in each cap's own unit. */
export const consumeUsageWindows = ({
	context,
	deductionState,
	row,
	units,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
	row: DeductionRow | null;
	units: Decimal;
}): void => {
	if (units.lte(0)) return;
	for (const limit of context.usageWindowLimits) {
		if (!appliesTo({ limit, row })) continue;
		const consumed =
			limit.dimension_type === "balance" && row
				? units.times(row.creditCost)
				: units;
		deductionState.usageWindowConsumed.set(
			limit.key,
			(
				deductionState.usageWindowConsumed.get(limit.key) ?? new Decimal(0)
			).plus(consumed),
		);
	}
};

/**
 * `decrement_usage_windows_for_unwind`: what a give-back frees on each cap, as negative consumption a draw
 * can start from. Never below an empty counter, so a window that rolled since the lock forfeits its count.
 */
export const deltasToFreedUsageWindows = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): Map<string, Decimal> => {
	const rows = [...context.rows, ...context.rolloverRows];
	const freedByLimitKey = new Map<string, Decimal>();
	for (const limit of context.usageWindowLimits) {
		let givenBack = new Decimal(0);
		for (const delta of deltas) {
			const row = rows.find((candidate) => candidate.id === delta.id) ?? null;
			if (delta.valueDelta <= 0 || !appliesTo({ limit, row })) continue;
			const units = new Decimal(delta.valueDelta);
			givenBack = givenBack.plus(
				limit.dimension_type === "balance"
					? units.times(delta.creditCost)
					: units,
			);
		}
		const freed = Decimal.min(givenBack, storedUsageOf({ context, limit }));
		if (freed.gt(0)) freedByLimitKey.set(limit.key, freed.neg());
	}
	return freedByLimitKey;
};

/** `update_in_memory_usage_window`: one row per cap, created on first use, zeroed when its window rolled, re-stamped with today's bounds. */
export const usageWindowsToRowChanges = ({
	context,
	deductionState,
}: {
	context: DeductionContext;
	deductionState: DeductionState;
}): RowChange[] => {
	const changes: RowChange[] = [];
	for (const limit of context.usageWindowLimits) {
		const consumed = deductionState.usageWindowConsumed.get(limit.key);
		if (!consumed || consumed.isZero()) continue;
		const existing = findUsageWindowByLimit({
			usageWindows: context.usageWindows,
			limit,
		});
		const stamped = {
			anchor_customer_entitlement_id: limit.anchor_customer_entitlement_id,
			window_start_at: limit.window_start_at,
			window_end_at: limit.window_end_at,
			usage: consumed.toNumber(),
			updated_at: context.now,
		};
		// A live counter adds, guarded by the window it counts in; a rolled one is re-stamped and restarted.
		const live = liveWindowOf({ context, limit });
		if (live) {
			changes.push({
				table: "usageWindows",
				op: "increment",
				id: live.id,
				add: { usage: consumed.toNumber() },
				guard: {
					anchor_customer_entitlement_id: live.anchor_customer_entitlement_id,
					window_start_at: live.window_start_at,
					window_end_at: live.window_end_at,
				},
			});
			continue;
		}
		if (consumed.lt(0)) continue;
		if (existing) {
			changes.push({
				table: "usageWindows",
				op: "update",
				id: existing.id,
				before: {
					anchor_customer_entitlement_id:
						existing.anchor_customer_entitlement_id,
					window_start_at: existing.window_start_at,
					window_end_at: existing.window_end_at,
					usage: existing.usage,
					updated_at: existing.updated_at,
				},
				after: stamped,
			});
			continue;
		}
		const row: WorkerUsageWindow = {
			// Deterministic from the counter's identity, so a replay creates the same row.
			id: `uw_${limit.key}`,
			internal_customer_id: limit.internal_customer_id,
			internal_entity_id: limit.internal_entity_id,
			feature_id: limit.feature_id,
			internal_feature_id: limit.internal_feature_id,
			filter_key: limit.filter_key,
			...stamped,
		};
		changes.push({ table: "usageWindows", op: "insert", row });
	}
	return changes;
};
