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

/** `apply_credit_rate_attribution_change`: the row's attribution with every delta charged to it folded in; an entry that nets to zero is dropped. */
const attributionAfter = ({
	before,
	deltas,
}: {
	before: Record<string, { units: number; credits: number }>;
	deltas: DeductionDelta[];
}): Record<string, { units: number; credits: number }> => {
	const after = { ...before };
	for (const { usageAttributionDelta } of deltas) {
		if (!usageAttributionDelta) continue;
		const current = after[usageAttributionDelta.key] ?? {
			units: 0,
			credits: 0,
		};
		const units = new Decimal(current.units).plus(usageAttributionDelta.units);
		const credits = new Decimal(current.credits).plus(
			usageAttributionDelta.credits,
		);
		if (units.abs().lte(1e-10) && credits.abs().lte(1e-10)) {
			delete after[usageAttributionDelta.key];
			continue;
		}
		after[usageAttributionDelta.key] = {
			units: units.toNumber(),
			credits: credits.toNumber(),
		};
	}
	return after;
};

/** The row's `entities` map with every per-entity delta folded in; a key first drawn into or refunded into is created. */
const entitiesAfter = <Entry extends { id: string; balance: number }>({
	before,
	deltas,
	createEntry,
	applyDelta,
}: {
	before: Record<string, Entry>;
	deltas: DeductionDelta[];
	createEntry: (entityKey: string) => Entry;
	applyDelta: (entry: Entry, delta: DeductionDelta) => Entry;
}): Record<string, Entry> => {
	const after = { ...before };
	for (const delta of deltas) {
		if (delta.entityKey === null) continue;
		after[delta.entityKey] = applyDelta(
			after[delta.entityKey] ?? createEntry(delta.entityKey),
			delta,
		);
	}
	return after;
};

/** Deltas are the log; a row change folds every delta on one row into before → after. */
export const deltasToRowChanges = ({
	context,
	deltas,
}: {
	context: DeductionContext;
	deltas: DeductionDelta[];
}): RowChange[] => {
	const changes: RowChange[] = [];

	for (const {
		id,
		balance,
		entities,
		usage_attribution,
	} of context.customerEntitlements) {
		const rowDeltas = rowDeltasOn({
			table: "customerEntitlements",
			id,
			deltas,
		});
		const ownDeltas = rowDeltas.filter((delta) => delta.entityKey === null);
		const entityDeltas = rowDeltas.filter((delta) => delta.entityKey !== null);
		const attributionDeltas = deltas.filter(
			(delta) => delta.usageAttributionDelta?.customerEntitlementId === id,
		);
		if (rowDeltas.length === 0 && attributionDeltas.length === 0) continue;
		const attribution =
			attributionDeltas.length === 0
				? {}
				: {
						usage_attribution: attributionAfter({
							before: usage_attribution ?? {},
							deltas: attributionDeltas,
						}),
					};
		changes.push({
			table: "customerEntitlements",
			op: "update",
			id,
			before: {
				...(ownDeltas.length === 0 ? {} : { balance }),
				...(entityDeltas.length === 0 ? {} : { entities }),
				...(attributionDeltas.length === 0
					? {}
					: { usage_attribution: usage_attribution ?? {} }),
			},
			after: {
				...(ownDeltas.length === 0
					? {}
					: {
							balance: sumOf([
								balance,
								...ownDeltas.map((d) => d.balanceDelta),
							]).toNumber(),
						}),
				...(entityDeltas.length === 0
					? {}
					: {
							entities: entitiesAfter({
								before: entities ?? {},
								deltas: entityDeltas,
								createEntry: (entityKey) => ({
									id: entityKey,
									balance: 0,
									adjustment: 0,
								}),
								applyDelta: (entry, delta) => ({
									...entry,
									balance: sumOf([
										entry.balance,
										delta.balanceDelta,
									]).toNumber(),
								}),
							}),
						}),
				...attribution,
			},
		});
	}

	for (const { id, balance, usage, entities } of context.rollovers) {
		const rowDeltas = rowDeltasOn({ table: "rollovers", id, deltas });
		const ownDeltas = rowDeltas.filter((delta) => delta.entityKey === null);
		const entityDeltas = rowDeltas.filter((delta) => delta.entityKey !== null);
		if (rowDeltas.length === 0) continue;
		changes.push({
			table: "rollovers",
			op: "update",
			id,
			before: {
				...(ownDeltas.length === 0 ? {} : { balance, usage }),
				...(entityDeltas.length === 0 ? {} : { entities }),
			},
			after: {
				...(ownDeltas.length === 0
					? {}
					: {
							balance: sumOf([
								balance,
								...ownDeltas.map((d) => d.balanceDelta),
							]).toNumber(),
							usage: sumOf([
								usage,
								...ownDeltas.map((d) => d.usageDelta),
							]).toNumber(),
						}),
				...(entityDeltas.length === 0
					? {}
					: {
							entities: entitiesAfter({
								before: entities,
								deltas: entityDeltas,
								createEntry: (entityKey) => ({
									id: entityKey,
									balance: 0,
									usage: 0,
								}),
								applyDelta: (entry, delta) => ({
									...entry,
									balance: sumOf([
										entry.balance,
										delta.balanceDelta,
									]).toNumber(),
									usage: sumOf([entry.usage, delta.usageDelta]).toNumber(),
								}),
							}),
						}),
			},
		});
	}

	return changes;
};
