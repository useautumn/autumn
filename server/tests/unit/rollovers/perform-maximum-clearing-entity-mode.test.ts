/**
 * Unit test for performMaximumClearing entity-mode cap enforcement.
 *
 * Red-failure mode (current behavior):
 *  - When the excess is spread across multiple rollover rows for one entity,
 *    entityIdToTotal is overwritten with (toDeduct - curBalance) instead of the
 *    remaining running total, so the next row computes a negative toDeduct and
 *    is skipped. Only the oldest row is trimmed and the cap is left exceeded.
 *
 * Green-success criteria (after fix):
 *  - Total entity balance across all rows is capped at `max`.
 */

import { expect, test } from "bun:test";
import type { FullCusEntWithProduct, Rollover } from "@autumn/shared";
import { performMaximumClearing } from "@/internal/customers/cusProducts/cusEnts/cusRollovers/rolloverUtils";

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

	// Each row carries both entities; e1 totals 1500 (over cap), e2 totals 200
	// (under cap). Draining e1 to 0 on the oldest row must NOT delete the row,
	// since e2 still has balance there.
	const rows = Array.from({ length: ROW_COUNT }, (_, index) =>
		makeRow(index, { [ENTITY_ID]: PER_ROW, [UNDER_ENTITY_ID]: UNDER_PER_ROW }),
	);

	const remaining = applyClearing(rows);

	expect(sumEntity(remaining, ENTITY_ID)).toBeLessThanOrEqual(MAX);
	// Under-cap entity is left fully intact.
	expect(sumEntity(remaining, UNDER_ENTITY_ID)).toBe(UNDER_PER_ROW * ROW_COUNT);
});
