/**
 * What the spec harvest produces. The first block reads the REAL spec: a test
 * against an invented schema passes while the real shape differs, which has
 * already produced two bad tests in this package.
 */

import { expect, test } from "bun:test";
import type { JsonSchema } from "../src/casing/schemaKeyCasing";
import { nodeRulesFromSpec } from "../src/lint/specRules/nodeRulesFromSpec";
import { catalogUpdateSchema, loadSpec } from "../src/spec/loadSpec";

const spec = loadSpec();
const root = spec as unknown as JsonSchema;
const rules = nodeRulesFromSpec({
	schema: catalogUpdateSchema({ spec }),
	root,
});

test("required and enum come off the allOf branches of a feature", () => {
	expect(rules.features?.required).toEqual(["featureId", "name", "type"]);
	expect(rules.features?.fields?.type?.enum).toEqual([
		"boolean",
		"metered",
		"credit_system",
		"ai_credit_system",
	]);
});

test("anyOf branches become variants, not a union of their required fields", () => {
	const line = rules["features.creditSchema"];
	expect(line?.required).toBeUndefined();
	expect(line?.variants?.on).toBe("tierBehavior");

	const graduated = line?.variants?.byValue.graduated;
	expect(graduated?.required).toContain("tiers");
	expect(graduated?.required).not.toContain("creditCost");

	const flat = line?.variants?.fallback;
	expect(flat?.required).toContain("creditCost");
	expect(flat?.required).not.toContain("tiers");
});

test("record keys are constrained by propertyNames, values one level down", () => {
	expect(rules["features.modelMarkups"]?.keys?.pattern).toBe(".+\\/.+");
	expect(rules["features.modelMarkups.*"]?.fields?.markup?.minimum).toBe(-100);
});

test("bounds survive from zod: minItems on tiers, exclusiveMinimum on to", () => {
	const graduated = rules["features.creditSchema"]?.variants?.byValue.graduated;
	expect(graduated?.fields?.tiers?.minItems).toBe(1);
	expect(
		rules["features.creditSchema.tiers"]?.fields?.to?.exclusiveMinimum,
	).toBe(0);
});

// --- synthetic edges the real spec does not isolate cleanly ---

const harvest = (schema: JsonSchema) =>
	nodeRulesFromSpec({
		schema: {
			type: "object",
			properties: { things: { type: "array", items: schema } },
		},
		root: {},
	});

test("a scalar union keeps type-guarded bounds and drops a one-sided enum", () => {
	const out = harvest({
		type: "object",
		properties: {
			to: {
				anyOf: [
					{ type: "number", exclusiveMinimum: 0 },
					{ type: "string", enum: ["inf"] },
				],
			},
		},
	});
	expect(out.things?.fields?.to).toEqual({ exclusiveMinimum: 0 });
});

test("a nullable object unwraps instead of becoming a variant", () => {
	const out = harvest({
		type: "object",
		properties: {
			display: {
				anyOf: [
					{
						type: "object",
						properties: { singular: { type: "string", minLength: 1 } },
						required: ["singular"],
					},
					{ type: "null" },
				],
			},
		},
	});
	expect(out["things.display"]?.variants).toBeUndefined();
	expect(out["things.display"]?.required).toEqual(["singular"]);
});

test("alternatives with no discriminator intersect, never union", () => {
	const out = harvest({
		anyOf: [
			{
				type: "object",
				properties: { a: { type: "string" }, b: { type: "string" } },
				required: ["a", "b"],
			},
			{
				type: "object",
				properties: { a: { type: "string" }, c: { type: "string" } },
				required: ["a", "c"],
			},
		],
	});
	expect(out.things?.required).toEqual(["a"]);
	expect(out.things?.variants).toBeUndefined();
});

test("$ref is followed", () => {
	const out = nodeRulesFromSpec({
		schema: {
			type: "object",
			properties: {
				things: {
					type: "array",
					items: { $ref: "#/components/schemas/Thing" },
				},
			},
		},
		root: {
			components: {
				schemas: {
					Thing: {
						type: "object",
						properties: { id: { type: "string" } },
						required: ["id"],
					},
				},
			},
		} as JsonSchema,
	});
	expect(out.things?.required).toEqual(["id"]);
});
