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

	expect(
		fixture.plans[0].billingControls.usageLimits[0].filter.properties,
	).toEqual({ api_key_id: "ak_1", ai_model_slug: "gpt-4" });

	expect(fixture.plans[0].metadata).toEqual({ some_key: "keep_me" });

	expect(Object.keys(fixture.features[0].modelMarkups)).toEqual(["gpt-4"]);
	expect(fixture.features[0].modelMarkups["gpt-4"].inputCost).toBe(3);
});

test("real spec: round trip is the identity", () => {
	const schema = catalogUpdateSchema();
	const fixture = wireToFixture({ value: WIRE, schema });
	expect(fixtureToWire({ value: fixture, schema })).toEqual(WIRE);
});

test("real spec: a free-form record value is untouched all the way down", () => {
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
	expect(toCamelCase(wire)).toBe(fixture);
	expect(toSnakeCase(fixture)).toBe(wire);
});
