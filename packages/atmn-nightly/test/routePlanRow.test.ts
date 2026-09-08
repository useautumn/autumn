import { expect, test } from "bun:test";
import {
	activeVersionOf,
	routePlanRow,
} from "../src/actions/pull/routePlanRow";

test("the active row is a plan, a newer inactive row is a draft, older rows are history", () => {
	const rows = [
		{ version: 1, active: false },
		{ version: 2, active: true },
		{ version: 3, active: false },
	];
	const activeVersion = activeVersionOf({ rows });
	expect(activeVersion).toBe(2);
	expect(routePlanRow({ row: rows[1]!, activeVersion })).toEqual({
		collection: "plans",
		draft: false,
	});
	expect(routePlanRow({ row: rows[2]!, activeVersion })).toEqual({
		collection: "plans",
		draft: true,
	});
	expect(routePlanRow({ row: rows[0]!, activeVersion })).toEqual({
		collection: "planVersions",
		draft: false,
	});
});

test("with no active row at all, everything is history", () => {
	expect(
		routePlanRow({
			row: { version: 4, active: false },
			activeVersion: undefined,
		}),
	).toEqual({
		collection: "planVersions",
		draft: false,
	});
});
