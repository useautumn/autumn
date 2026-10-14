import type { DeductionPeriod } from "@autumn/shared";
import type { EventRow, EventsData } from "../components/analytics-types";
import { epochToPeriodString } from "./epochToPeriodString";

export const CUSTOMER_BALANCE_SUFFIX = " · customer";

export function deductionsToEventsData({
	deductions,
	utc,
	splitSpillover = false,
}: {
	deductions: DeductionPeriod[];
	utc: boolean;
	splitSpillover?: boolean;
}): EventsData {
	const grouped = deductions.some(
		(period) => period.grouped_values !== undefined,
	);
	const columns = new Set<string>();
	const sortable: Array<{ epoch: number; row: EventRow }> = [];

	for (const period of deductions) {
		const row: EventRow = {
			period: epochToPeriodString({ epochMs: period.period, utc }),
		};

		if (grouped) {
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
