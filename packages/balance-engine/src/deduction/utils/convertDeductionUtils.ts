import { Decimal } from "decimal.js";
import type { RowChange } from "../../models/mutation/rowChange.js";
import type { DeductionContext } from "../types/deductionContext.js";
import type { DeductionDelta } from "../types/deductionDelta.js";
import type { DeductionRow } from "../types/deductionRow.js";

const deltasOn = ({
	row,
	deltas,
}: {
	row: Pick<DeductionRow, "table" | "id" | "entityKey">;
	deltas: DeductionDelta[];
}): DeductionDelta[] =>
	deltas.filter(
		(delta) =>
			delta.table === row.table &&
			delta.id === row.id &&
			delta.entityKey === row.entityKey,
	);

const sumOf = (values: number[]): Decimal =>
	values.reduce((total, value) => total.plus(value), new Decimal(0));

/** The row's balance as the buckets so far have left it: stored plus every delta on it. */
export const deductionRowToCurrentBalance = ({
	row,
	deltas,
}: {
	row: DeductionRow;
	deltas: DeductionDelta[];
}): Decimal =>
	new Decimal(row.balance).plus(
		sumOf(deltasOn({ row, deltas }).map((delta) => delta.balanceDelta)),
	);

/** Units charged to the row's rate card so far: stored attribution plus every attribution delta on the owner. */
export const deductionRowToRateUnits = ({
	row,
	deltas,
}: {
	row: DeductionRow;
	deltas: DeductionDelta[];
}): Decimal =>
	new Decimal(row.rateUnits).plus(
		sumOf(
			deltas
				.map((delta) => delta.usageAttributionDelta)
				.filter(
					(attribution) =>
						attribution !== undefined &&
						attribution.customerEntitlementId === row.ownerId &&
						attribution.key === row.rateCard?.source_internal_feature_id,
				)
				.map((attribution) => attribution?.units ?? 0),
		),
	);

/** Every delta on the row, whichever balance on it moved. */
const rowDeltasOn = ({
	table,
	id,
	deltas,
}: {
	table: DeductionRow["table"];
	id: string;
	deltas: DeductionDelta[];
}): DeductionDelta[] =>
	deltas.filter((delta) => delta.table === table && delta.id === id);

/** Deltas summed by the map key they moved; a key that nets to zero is left out. */
const sumByEntityKey = ({
	deltas,
	amountOf,
}: {
	deltas: DeductionDelta[];
	amountOf: (delta: DeductionDelta) => number;
}): Record<string, number> => {
	const totals: Record<string, Decimal> = {};
	for (const delta of deltas) {
		if (delta.entityKey === null) continue;
		totals[delta.entityKey] = (totals[delta.entityKey] ?? new Decimal(0)).plus(
			amountOf(delta),
		);
	}
	return Object.fromEntries(
		Object.entries(totals)
			.filter(([, total]) => !total.isZero())
			.map(([key, total]) => [key, total.toNumber()]),
	);
};

const nonZero = (value: Decimal): number | undefined =>
	value.isZero() ? undefined : value.toNumber();

const definedEntries = <Value>(record: Record<string, Value | undefined>) =>
	Object.fromEntries(
		Object.entries(record).filter(([, value]) => value !== undefined),
	);

/** Attribution moved on the owning row, by key: units and credits together. */
const attributionIncrementsOn = ({
	id,
	deltas,
}: {
	id: string;
	deltas: DeductionDelta[];
}): Record<string, { units?: number; credits?: number }> => {
	const totals: Record<string, { units: Decimal; credits: Decimal }> = {};
	for (const { usageAttributionDelta } of deltas) {
		if (
			!usageAttributionDelta ||
			usageAttributionDelta.customerEntitlementId !== id
		)
			continue;
		const current = totals[usageAttributionDelta.key] ?? {
			units: new Decimal(0),
			credits: new Decimal(0),
		};
		totals[usageAttributionDelta.key] = {
			units: current.units.plus(usageAttributionDelta.units),
			credits: current.credits.plus(usageAttributionDelta.credits),
		};
	}
	return Object.fromEntries(
		Object.entries(totals)
			.filter(([, total]) => !(total.units.isZero() && total.credits.isZero()))
			.map(([key, total]) => [
				key,
				{ units: total.units.toNumber(), credits: total.credits.toNumber() },
			]),
	);
};

/** Deltas are the log; a row change adds what every delta on one row moved. Nothing is set, so the change composes with any other writer of the row. */
export const deltasToRowChanges = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): RowChange[] => {
	const changes: RowChange[] = [];

	for (const { id } of context.customerEntitlements) {
		const rowDeltas = rowDeltasOn({
			table: "customerEntitlements",
			id,
			deltas,
		});
		const balance = nonZero(
			sumOf(
				rowDeltas
					.filter((delta) => delta.entityKey === null)
					.map((delta) => delta.balanceDelta),
			),
		);
		const entities = Object.fromEntries(
			Object.entries(
				sumByEntityKey({ deltas: rowDeltas, amountOf: (d) => d.balanceDelta }),
			).map(([key, amount]) => [key, { balance: amount }]),
		);
		const usage_attribution = attributionIncrementsOn({ id, deltas });
		const addEntries = definedEntries({
			entities: Object.keys(entities).length ? entities : undefined,
			usage_attribution: Object.keys(usage_attribution).length
				? usage_attribution
				: undefined,
		});
		if (balance === undefined && Object.keys(addEntries).length === 0) continue;
		changes.push({
			table: "customerEntitlements",
			op: "increment",
			id,
			add: definedEntries({ balance }),
			...(Object.keys(addEntries).length ? { addEntries } : {}),
		});
	}

	for (const { id } of context.rollovers) {
		const rowDeltas = rowDeltasOn({ table: "rollovers", id, deltas });
		if (rowDeltas.length === 0) continue;
		const own = rowDeltas.filter((delta) => delta.entityKey === null);
		const add = definedEntries({
			balance: nonZero(sumOf(own.map((delta) => delta.balanceDelta))),
			usage: nonZero(sumOf(own.map((delta) => delta.usageDelta))),
		});
		const balances = sumByEntityKey({
			deltas: rowDeltas,
			amountOf: (d) => d.balanceDelta,
		});
		const usages = sumByEntityKey({
			deltas: rowDeltas,
			amountOf: (d) => d.usageDelta,
		});
		const entities = Object.fromEntries(
			[...new Set([...Object.keys(balances), ...Object.keys(usages)])].map(
				(key) => [
					key,
					definedEntries({ balance: balances[key], usage: usages[key] }),
				],
			),
		);
		if (Object.keys(add).length === 0 && Object.keys(entities).length === 0)
			continue;
		changes.push({
			table: "rollovers",
			op: "increment",
			id,
			add,
			...(Object.keys(entities).length ? { addEntries: { entities } } : {}),
		});
	}

	return changes;
};
