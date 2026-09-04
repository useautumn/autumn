/**
 * The unit tests run against a schema this repo wrote by hand, which is exactly
 * how a mapper passes its tests and still corrupts real data: the hand-written
 * `usage_limits` was an object, the real one is an array, and a shape that does
 * not line up means the schema lookup misses and every key underneath gets
 * recased blindly — including the user's event properties.
 *
 * So these run against `openapi-internal.yml` itself. If the spec moves, these
 * fail; that is the point.
 */

import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import yaml from "yaml";
import {
	fixtureToWire,
	type JsonSchema,
	toCamelCase,
	toSnakeCase,
	wireToFixture,
} from "../src/casing/schemaKeyCasing";

// biome-ignore lint/suspicious/noExplicitAny: the raw OpenAPI document
const specDocument = (): any =>
	yaml.parse(
		readFileSync(
			`${import.meta.dir}/../../openapi/openapi-internal.yml`,
			"utf8",
		),
	);

const catalogUpdateSchema = (): JsonSchema => {
	const doc = yaml.parse(
		readFileSync(
			`${import.meta.dir}/../../openapi/openapi-internal.yml`,
			"utf8",
		),
	);
	return doc.paths["/v1/catalogV2.update"].post.requestBody.content[
		"application/json"
	].schema;
};

const WIRE = {
	features: [
		{
			feature_id: "messages",
			name: "Messages",
			type: "metered",
			model_markups: { "gpt-4": { markup: 1.2, input_cost: 3 } },
		},
	],
	plans: [
		{
			plan_id: "pro",
			version_slug: "v2",
			internal_id: "prod_1",
			billing_controls: {
				usage_limits: [
					{
						feature_id: "messages",
						enabled: true,
						limit: 10,
						filter: {
							properties: { api_key_id: "ak_1", ai_model_slug: "gpt-4" },
						},
					},
				],
			},
			metadata: { some_key: "keep_me" },
			items: [{ feature_id: "messages", included: 100 }],
		},
	],
	skip_deletions: false,
};

test("real spec: our keys recase at every depth", () => {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic shape under test
	const fixture = wireToFixture({
		value: WIRE,
		schema: catalogUpdateSchema(),
	}) as any;

	expect(fixture.skipDeletions).toBe(false);
	expect(fixture.features[0].featureId).toBe("messages");
	expect(fixture.plans[0].planId).toBe("pro");
	expect(fixture.plans[0].versionSlug).toBe("v2");
	expect(fixture.plans[0].internalId).toBe("prod_1");
	expect(fixture.plans[0].items[0].featureId).toBe("messages");
	expect(fixture.plans[0].billingControls.usageLimits[0].featureId).toBe(
		"messages",
	);
});

test("real spec: user-owned keys survive untouched", () => {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic shape under test
	const fixture = wireToFixture({
		value: WIRE,
		schema: catalogUpdateSchema(),
	}) as any;

	// Event property conditions — recasing these changes which events count.
	expect(
		fixture.plans[0].billingControls.usageLimits[0].filter.properties,
	).toEqual({ api_key_id: "ak_1", ai_model_slug: "gpt-4" });

	expect(fixture.plans[0].metadata).toEqual({ some_key: "keep_me" });

	// A record key stays, while the object it holds is still recased.
	expect(Object.keys(fixture.features[0].modelMarkups)).toEqual(["gpt-4"]);
	expect(fixture.features[0].modelMarkups["gpt-4"].inputCost).toBe(3);
});

test("real spec: round trip is the identity", () => {
	const schema = catalogUpdateSchema();
	const fixture = wireToFixture({ value: WIRE, schema });
	expect(fixtureToWire({ value: fixture, schema })).toEqual(WIRE);
});

/**
 * Regressions found by sweeping the mapper against the whole spec. Each was
 * silent: the value came back changed with no error anywhere.
 */

test("real spec: a free-form record value is untouched all the way down", () => {
	// `metadata` is z.record(string, z.any()) -> `additionalProperties: {}`.
	// Protecting only the record's own keys left everything below them exposed.
	const schema = catalogUpdateSchema();
	const root = specDocument();
	const wire = {
		plans: [
			{
				plan_id: "pro",
				metadata: { crm_sync: { external_id: "abc", region_1: "us" } },
			},
		],
	};
	const fixture = wireToFixture({ value: wire, schema, root });
	expect(fixtureToWire({ value: fixture, schema, root })).toEqual(wire);
});

test("real spec: $ref is followed, so records behind one keep their keys", () => {
	// customer_data is a $ref to CustomerData, whose `metadata` is a record.
	// Unresolved, the stub has no properties and everything under it was recased
	// blind — 12 request bodies spec-wide.
	const root = specDocument();
	const schema =
		root.paths["/v1/balances.track"].post.requestBody.content[
			"application/json"
		].schema;
	const wire = {
		customer_id: "c",
		feature_id: "f",
		customer_data: { metadata: { signup_source: "ads", region_1: "us" } },
	};
	const fixture = wireToFixture({ value: wire, schema, root });
	expect(fixtureToWire({ value: fixture, schema, root })).toEqual(wire);
});

test("filter operators are literal API keys, not snake_case fields", () => {
	// $starts_with is not an operator the server has.
	expect(toSnakeCase("$startsWith")).toBe("$startsWith");
	expect(toCamelCase("$startsWith")).toBe("$startsWith");
});

test.each([
	["a_1_b", "a_1B"],
	["region_1", "region_1"],
	["tier_1", "tier_1"],
	["stripe_v2_price_id", "stripeV2PriceId"],
	["oauth2_token", "oauth2Token"],
])("%s round-trips through camelCase", (wire, fixture) => {
	// `_1` has no uppercase form, so folding it consumed the underscore and
	// `region_1` came back as `region1`.
	expect(toCamelCase(wire)).toBe(fixture);
	expect(toSnakeCase(fixture)).toBe(wire);
});
