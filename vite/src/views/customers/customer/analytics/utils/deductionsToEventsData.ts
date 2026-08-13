import type { DeductionPeriod } from "@autumn/shared";

type EventRow = Record<string, string | number>;

interface EventsData {
	meta: Array<{ name: string }>;
	rows: number;
	data: EventRow[];
}

const pad = (value: number): string => String(value).padStart(2, "0");

/**
 * The server converts the pipe's "%F %T" period strings to epoch ms; the chart
 * parses period strings (parseLocalTimestamp for day bins, parseUTCTimestamp
 * for hour bins). Formatting the epoch back as a UTC wall-clock string
 * round-trips to exactly what the pipe emitted, so both parse paths behave the
 * same as they do for the normal events pipeline.
 */
const toPeriodString = (epochMs: number): string => {
	const date = new Date(epochMs);
	return (
		`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
		`${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
	);
};

/**
 * Pivots the `deductions` response into the exact EventsData shape the existing
 * chart pipeline consumes, so trim / config / legend / tooltips all work
 * unchanged.
 *
 * Columns are `${balanceFeatureId}__${groupValue}` — the same `feature__group`
 * convention transformGroupedData emits — so generateChartConfig labels them
 * "Pool Credits (action1)" with no new code. The balance-owning feature stays in
 * the column key because the same source can hit two balances in different
 * units (action1 drains its own meter AND converts into credits), and merging
 * those would add seconds to credits.
 *
 * Output is already pivoted, so transformGroupedData no-ops on it (it looks for
 * a raw group column that doesn't exist) and the data flows straight to
 * trimToTopSeries. Grouping is self-detected from grouped_values; without it
 * (e.g. a property group_by, which deductions don't serve) columns fall back to
 * one per balance-owning feature.
 */
/** Suffix appended to a group's series when it spent from a balance it doesn't own. */
export const CUSTOMER_BALANCE_SUFFIX = " · customer";

export function deductionsToEventsData({
	deductions,
	splitSpillover = false,
}: {
	deductions: DeductionPeriod[];
	/** Split each entity's series into own-balance vs customer-level spillover. */
	splitSpillover?: boolean;
}): EventsData {
	const grouped = deductions.some(
		(period) => period.grouped_values !== undefined,
	);
	const columns = new Set<string>();
	const sortable: Array<{ epoch: number; row: EventRow }> = [];

	for (const period of deductions) {
		const row: EventRow = { period: toPeriodString(period.period) };

		if (grouped) {
			// grouped_values is keyed by balance_id; resolve each balance back to
			// its owning feature so balances of one feature merge into one series.
			const balanceToFeature = new Map<string, string>();
			const balanceToEntity = new Map<string, string | null>();
			for (const [featureId, feature] of Object.entries(period.values)) {
				for (const balance of feature.balances) {
					balanceToFeature.set(balance.balance_id, featureId);
					balanceToEntity.set(balance.balance_id, balance.entity_id ?? null);
				}
			}

			for (const [balanceId, split] of Object.entries(
				period.grouped_values ?? {},
			)) {
				const featureId = balanceToFeature.get(balanceId);
				if (!featureId) continue;

				for (const [groupValue, entry] of Object.entries(split)) {
					// A group spending from a balance owned by a DIFFERENT entity (or
					// by no entity — a customer-level shared pool) is spillover.
					const isSpillover =
						splitSpillover && balanceToEntity.get(balanceId) !== groupValue;
					const key = `${featureId}__${groupValue}${isSpillover ? CUSTOMER_BALANCE_SUFFIX : ""}`;
					columns.add(key);
					row[key] = Number(row[key] ?? 0) + entry.deducted;
				}
			}
		} else {
			for (const [featureId, feature] of Object.entries(period.values)) {
				columns.add(featureId);
				row[featureId] = feature.deducted;
			}
		}

		sortable.push({ epoch: period.period, row });
	}

	// Zero-fill so every row carries every series — stacked bars misalign on
	// missing keys.
	for (const { row } of sortable) {
		for (const column of columns) {
			row[column] ??= 0;
		}
	}

	sortable.sort((a, b) => a.epoch - b.epoch);

	return {
		meta: [{ name: "period" }, ...[...columns].map((name) => ({ name }))],
		rows: sortable.length,
		data: sortable.map(({ row }) => row),
	};
}
