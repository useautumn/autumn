import { performMaximumClearing } from "@autumn/shared";

import { expect, test } from "bun:test";
import type { FullCusEntWithProduct, Rollover } from "@autumn/shared";

const ENTITY_ID = "e1";
const MAX = 1080;
const PER_ROW = 300;
const ROW_COUNT = 5;

const makeRow = (index: number, entities: Record<string, number>): Rollover =>
	({
		id: `roll_${index}`,
		cus_ent_id: "cus_ent_1",
		balance: 0,
		usage: 0,
		expires_at: null,
		entities: Object.fromEntries(
			Object.entries(entities).map(([id, balance]) => [
				id,
				{ id, balance, usage: 0 },
			]),
		),
	}) as Rollover;

const makeCusEnt = () =>
	({
		entitlement: {
			entity_feature_id: ENTITY_ID,
			rollover: { max: MAX, length: 1 },
		},
	}) as unknown as FullCusEntWithProduct;

const sumEntity = (rows: Rollover[], entityId: string) =>
	rows.reduce((sum, row) => sum + (row.entities[entityId]?.balance ?? 0), 0);

const applyClearing = (rows: Rollover[]) => {
	const { toDelete, toUpdate } = performMaximumClearing({
		rows,
		cusEnt: makeCusEnt(),
	});
	return rows
		.filter((row) => !toDelete.includes(row.id))
		.map((row) => toUpdate.find((updated) => updated.id === row.id) ?? row);
};

test("performMaximumClearing caps entity rollover spread across multiple rows", () => {
	const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
		makeRow(index, { [ENTITY_ID]: PER_ROW }),
	);

	const totalEntityBalance = sumEntity(applyClearing(rows), ENTITY_ID);

	expect(
		totalEntityBalance,
		`entity rollover total ${totalEntityBalance} exceeded max ${MAX}`,
	).toBeLessThanOrEqual(MAX);
});

test("performMaximumClearing caps over-cap entity without touching an under-cap entity in the same rows", () => {
	const UNDER_ENTITY_ID = "e2";
	const UNDER_PER_ROW = 40;

	const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
		makeRow(index, { [ENTITY_ID]: PER_ROW, [UNDER_ENTITY_ID]: UNDER_PER_ROW }),
	);

	const remaining = applyClearing(rows);

	expect(sumEntity(remaining, ENTITY_ID)).toBeLessThanOrEqual(MAX);
	expect(sumEntity(remaining, UNDER_ENTITY_ID)).toBe(UNDER_PER_ROW * ROW_COUNT);
});
