import { Decimal } from "decimal.js";
import type { ClickHouseResult } from "@autumn/shared";

export const collapsePlanIdGroups = ({
	events,
	internalIdToPublicId,
}: {
	events: ClickHouseResult;
	internalIdToPublicId: Record<string, string>;
}) => {
	const collapsed = new Map<string, Record<string, string | number>>();

	for (const row of events.data) {
		const planId = String(row.plan_id ?? "");
		const collapsedId =
			planId === "" || planId === "AUTUMN_RESERVED"
				? planId
				: internalIdToPublicId[planId] ?? planId;

		const key = `${row.period}|${collapsedId}`;
		const existing = collapsed.get(key);

		if (!existing) {
			collapsed.set(key, {
				...row,
				plan_id: collapsedId,
			});
			continue;
		}

		for (const [k, v] of Object.entries(row)) {
			if (k === "period" || k === "plan_id") continue;
			existing[k] = new Decimal(existing[k] ?? 0)
				.plus(new Decimal(v as number))
				.toDecimalPlaces(10)
				.toNumber();
		}
	}

	events.data = Array.from(collapsed.values());
	events.rows = events.data.length;
};
