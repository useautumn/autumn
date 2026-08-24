import type { EventRow, EventsData } from "../components/analytics-types";

const rowHasUsage = ({
	row,
	skipColumns,
}: {
	row: EventRow;
	skipColumns: Set<string>;
}): boolean => {
	for (const key in row) {
		if (skipColumns.has(key)) continue;
		if (Number(row[key]) !== 0) return true;
	}
	return false;
};

/**
 * Drops all-zero rows before the pivot, keeping one placeholder per period so an
 * idle day still gets an x-axis slot. A wholly empty range returns no rows at all.
 */
export function dropZeroRowsKeepingPeriods({
	events,
	groupColumn,
}: {
	events: EventsData;
	groupColumn: string | null;
}): EventsData {
	const skipColumns = new Set(
		["period", groupColumn].filter(Boolean) as string[],
	);

	const periodOrder: string[] = [];
	const usageRowsByPeriod = new Map<string, EventRow[]>();
	const placeholderByPeriod = new Map<string, EventRow>();
	let hasAnyUsage = false;

	for (const row of events.data) {
		const period = String(row.period);
		let usageRows = usageRowsByPeriod.get(period);
		if (!usageRows) {
			usageRows = [];
			usageRowsByPeriod.set(period, usageRows);
			periodOrder.push(period);
		}

		if (rowHasUsage({ row, skipColumns })) {
			usageRows.push(row);
			hasAnyUsage = true;
			continue;
		}

		if (!placeholderByPeriod.has(period)) placeholderByPeriod.set(period, row);
	}

	if (!hasAnyUsage) return { ...events, data: [], rows: 0 };

	const data: EventRow[] = [];
	for (const period of periodOrder) {
		const usageRows = usageRowsByPeriod.get(period) ?? [];
		if (usageRows.length > 0) {
			data.push(...usageRows);
			continue;
		}
		const placeholder = placeholderByPeriod.get(period);
		if (placeholder) data.push(placeholder);
	}

	if (data.length === events.data.length) return events;
	return { ...events, data, rows: data.length };
}
