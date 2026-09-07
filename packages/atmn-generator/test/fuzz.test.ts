/**
 * What the fuzz coverage tools produce. The first block is synthetic so the
 * numbers are exact and legible; the second reads the REAL spec, since a test
 * against an invented schema can pass while the real shape differs.
 */

import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import type { CoverageReport } from "../src/fuzz/coverageReport";
import {
	coverageReport,
	formatCoverageReport,
} from "../src/fuzz/coverageReport";
import { documentPaths } from "../src/fuzz/documentPaths";
import { schemaPaths } from "../src/fuzz/schemaPaths";
import { OVERLAY } from "../src/overlay/overlay";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const EMPTY_OVERLAY = { collections: {}, exposeInternal: [] };

const syntheticSchema: JsonSchema = {
	type: "object",
	properties: {
		things: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string" },
					status: { type: "string", enum: ["active", "archived"] },
				},
			},
		},
	},
};

test("a synthetic schema: three paths, one enum, a document touching two", () => {
	const schema = schemaPaths({
		schema: syntheticSchema,
		root: {},
		overlay: EMPTY_OVERLAY,
	});
	expect([...schema.keys()].sort()).toEqual([
		"things",
		"things.id",
		"things.status",
	]);
	expect([...(schema.get("things.status") ?? [])]).toEqual([
		"active",
		"archived",
	]);

	const document = documentPaths({ document: { things: [{ id: "abc" }] } });
	const report = coverageReport({ schema, document, collection: "things" });

	expect(report.total).toBe(3);
	expect(report.touched).toBe(2);
	expect(report.percent).toBe(67);
	expect(report.untouched).toEqual(["things.status"]);
	expect(report.unusedEnumValues).toEqual([
		"things.status = active",
		"things.status = archived",
	]);

	expect(formatCoverageReport({ report, collection: "things" })).toStartWith(
		"things: 2/3 paths touched (67%)",
	);
});

test("formatCoverageReport caps each section at 40 lines with a +N more tail", () => {
	const untouched = Array.from(
		{ length: 45 },
		(_, index) => `things.field${index}`,
	);
	const report: CoverageReport = {
		total: 45,
		touched: 0,
		percent: 0,
		untouched,
		unusedEnumValues: [],
	};

	const lines = formatCoverageReport({ report, collection: "things" }).split(
		"\n",
	);
	expect(
		lines.filter((line) => line.startsWith("    things.field")).length,
	).toBe(40);
	expect(lines.at(-1)).toBe("    +5 more");
});

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const realSchema = schemaPaths({
	schema: catalogUpdateSchema({ spec }),
	root,
	overlay: OVERLAY,
});

test("the real spec: plans exposes tierBehavior but hides versioning and priceId", () => {
	expect(
		[...(realSchema.get("plans.items.price.tierBehavior") ?? [])].sort(),
	).toEqual(["graduated", "volume"]);
	// Overlay-hidden: the server derives it from the rows, so a config can't set it.
	expect(realSchema.has("plans.versioning")).toBe(false);
	// x-internal: a server-owned id, never a fixture field.
	expect(realSchema.has("plans.items.priceId")).toBe(false);
});
