/**
 * Fixtures are camelCase because they are TypeScript; the wire is snake_case
 * because it is the API. The whole risk in that mapping is telling OUR keys
 * apart from the USER'S — recase `filter.properties.api_key_id` and you have
 * silently changed which events a usage limit counts.
 *
 * The rule is read off the JSON Schema, never a maintained list: `properties`
 * means the schema named the keys; `additionalProperties` alone means any key
 * is allowed, so the keys are data.
 */

import { describe, expect, test } from "bun:test";
import {
	fixtureToWire,
	isRecordSchema,
	type JsonSchema,
	toCamelCase,
	toSnakeCase,
	wireToFixture,
} from "../src/casing/schemaKeyCasing";

/** Shaped like the real spec: fixed keys, a record, and a record of objects. */
const PLAN_SCHEMA: JsonSchema = {
	type: "object",
	properties: {
		plan_id: { type: "string" },
		version_slug: { type: "string" },
		usage_limits: {
			type: "object",
			properties: {
				enabled: { type: "boolean" },
				overage_limit: { type: "number" },
				filter: {
					type: "object",
					properties: {
						// z.record(string, string) — the user's event properties
						properties: {
							type: "object",
							additionalProperties: { type: "string" },
						},
					},
				},
			},
		},
		metadata: { type: "object", additionalProperties: { type: "string" } },
		model_markups: {
			type: "object",
			// a record whose VALUES are our objects
			additionalProperties: {
				type: "object",
				properties: {
					input_cost: { type: "number" },
					output_cost: { type: "number" },
				},
			},
		},
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					feature_id: { type: "string" },
					included: { type: "number" },
				},
			},
		},
	},
};

describe("key classification", () => {
	test("a schema that names its keys is ours", () => {
		expect(isRecordSchema({ type: "object", properties: {} })).toBe(false);
	});

	test("a schema that allows any key holds user data", () => {
		expect(
			isRecordSchema({
				type: "object",
				additionalProperties: { type: "string" },
			}),
		).toBe(true);
	});

	test("additionalProperties alongside properties is still ours", () => {
		expect(
			isRecordSchema({
				type: "object",
				properties: { a: { type: "string" } },
				additionalProperties: { type: "string" },
			}),
		).toBe(false);
	});
});

describe("word conversion", () => {
	test.each([
		["plan_id", "planId"],
		["version_slug", "versionSlug"],
		["skip_overage_billing", "skipOverageBilling"],
		["enabled", "enabled"],
		["model_markups", "modelMarkups"],
	])("%s -> %s", (wire, fixture) => {
		expect(toCamelCase(wire)).toBe(fixture);
		expect(toSnakeCase(fixture)).toBe(wire);
	});
});

describe("wire -> fixture", () => {
	const wire = {
		plan_id: "pro",
		version_slug: "v2",
		usage_limits: {
			enabled: true,
			overage_limit: 100,
			filter: { properties: { api_key_id: "ak_1", ai_model_slug: "gpt-4" } },
		},
		metadata: { some_key: "untouched", another_one: "also untouched" },
		model_markups: { "gpt-4": { input_cost: 1, output_cost: 2 } },
		items: [{ feature_id: "messages", included: 100 }],
	};

	const fixture = wireToFixture({ value: wire, schema: PLAN_SCHEMA }) as Record<
		string,
		// biome-ignore lint/suspicious/noExplicitAny: test reads into a dynamic shape
		any
	>;

	test("our keys are recased, at every depth", () => {
		expect(fixture.planId).toBe("pro");
		expect(fixture.versionSlug).toBe("v2");
		expect(fixture.usageLimits.overageLimit).toBe(100);
		expect(fixture.items[0].featureId).toBe("messages");
	});

	test("the user's event properties are untouched", () => {
		// The bug this whole file exists for: recasing these changes which
		// events the limit counts.
		expect(fixture.usageLimits.filter.properties).toEqual({
			api_key_id: "ak_1",
			ai_model_slug: "gpt-4",
		});
	});

	test("metadata keys are untouched", () => {
		expect(fixture.metadata).toEqual({
			some_key: "untouched",
			another_one: "also untouched",
		});
	});

	test("a record's keys survive while its values are still recased", () => {
		expect(Object.keys(fixture.modelMarkups)).toEqual(["gpt-4"]);
		expect(fixture.modelMarkups["gpt-4"]).toEqual({
			inputCost: 1,
			outputCost: 2,
		});
	});
});

describe("round trip", () => {
	test("wire -> fixture -> wire is the identity", () => {
		const wire = {
			plan_id: "pro",
			usage_limits: {
				enabled: false,
				filter: { properties: { api_key_id: "ak_1" } },
			},
			metadata: { camelLooking_key: "x" },
			model_markups: { "claude-opus": { input_cost: 3, output_cost: 4 } },
			items: [{ feature_id: "seats", included: 5 }],
		};
		const fixture = wireToFixture({ value: wire, schema: PLAN_SCHEMA });
		expect(fixtureToWire({ value: fixture, schema: PLAN_SCHEMA })).toEqual(
			wire,
		);
	});

	test("a camelCase-looking user key is not mangled on the way back", () => {
		// toSnakeCase would turn `camelLooking_key` into `camel_looking_key`.
		// It survives only because the schema says metadata's keys are data.
		const fixture = { metadata: { camelLooking_key: "x" } };
		expect(fixtureToWire({ value: fixture, schema: PLAN_SCHEMA })).toEqual({
			metadata: { camelLooking_key: "x" },
		});
	});
});

describe("unknown shapes", () => {
	test("a key the schema does not describe is still recased", () => {
		// Better to recase consistently than to leak a snake_case key into a
		// camelCase fixture because the spec lagged.
		expect(
			wireToFixture({ value: { brand_new_field: 1 }, schema: PLAN_SCHEMA }),
		).toEqual({ brandNewField: 1 });
	});

	test("nulls and scalars pass through", () => {
		expect(
			wireToFixture({ value: { plan_id: null }, schema: PLAN_SCHEMA }),
		).toEqual({ planId: null });
	});
});
