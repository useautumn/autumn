/**
 * A path-keyed registry has one failure mode: a rule that never runs because
 * its path or a field name is wrong. Generation must refuse, not shrug.
 */

import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { LINT_REGISTRY } from "../src/lint/rules/registry";
import { validateRegistry } from "../src/lint/validateRegistry";
import { OVERLAY } from "../src/overlay/overlay";
import { fieldsAtPath } from "../src/spec/fieldsAtPath";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const schema = catalogUpdateSchema({ spec });

const validate =
	(registry: Parameters<typeof validateRegistry>[0]["registry"]) => () =>
		validateRegistry({ registry, schema, root, overlay: OVERLAY });

test("the real registry is fully alive", () => {
	expect(validate(LINT_REGISTRY)).not.toThrow();
});

test("fields at a path are the union across branches, through arrays and records", () => {
	const line = fieldsAtPath({ schema, root, path: "features.creditSchema" });
	expect(line?.has("tiers")).toBe(true);
	expect(line?.has("creditCost")).toBe(true);

	const markup = fieldsAtPath({
		schema,
		root,
		path: "features.modelMarkups.*",
	});
	expect(markup?.has("markup")).toBe(true);

	expect(fieldsAtPath({ schema, root, path: "plans.item" })).toBeUndefined();
});

test("a dead path is refused", () => {
	expect(validate({ "plans.item": { label: "item" } })).toThrow(
		'"plans.item" is not a path in the catalog',
	);
});

test("a dead field in a rule or idField is refused, listing the real fields", () => {
	expect(
		validate({
			features: {
				idField: "id",
				rules: [
					{
						kind: "requiredWhen",
						when: "type",
						equals: "metered",
						require: ["consumible"],
						because: "B.",
					},
				],
			},
		}),
	).toThrow(
		/idField names "id".*\n.*names "consumible".*Fields: .*consumable/s,
	);
});

test("an exists rule must point at a real collection and field", () => {
	expect(
		validate({
			features: {
				rules: [
					{
						kind: "exists",
						field: "featureId",
						in: "plan",
						matching: "planId",
						because: "B.",
					},
				],
			},
		}),
	).toThrow('points at "plan", which is not a top-level collection');

	expect(
		validate({
			features: {
				rules: [
					{
						kind: "exists",
						field: "featureId",
						in: "plans",
						matching: "id",
						because: "B.",
					},
				],
			},
		}),
	).toThrow('matches on "plans.id", which is not a field there');
});
