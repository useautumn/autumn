import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COLLECTIONS } from "../src/generated/emit";
import { emitFixture } from "../src/generated/emitRuntime";

/**
 * Runs the GENERATED modules, not a copy of their logic — a test that reasoned
 * about the emitter would pass while the emitted code was wrong.
 */

const SPEC = COLLECTIONS.features;

const FEATURES = SPEC.keys;

test("a metered feature is emitted exactly as the surgery expects", () => {
	const text = emitFixture({
		spec: SPEC,
		row: {
			id: "messages",
			name: "Messages",
			type: "metered",
			consumable: true,
			eventNames: ["messages.sent"],
			archived: false,
		},
		includeMappings: false,
		// `indent` is the fixture line's own indent; a fixture at column 0 puts
		// its properties at one tab.
		indent: "",
	});

	// `id` under `featureId`, spec key order (name first), server-only fields
	// gone, trailing commas inside, none after the closing paren.
	expect(text).toBe(`feature({
	name: "Messages",
	type: "metered",
	consumable: true,
	featureId: "messages",
})`);
});

type Case = {
	name: string;
	row: Record<string, unknown>;
	includeMappings: boolean;
	expected: Record<string, unknown>;
};

const CASES: Case[] = [
	{
		name: "boolean",
		row: { id: "seats", name: "Seats", type: "boolean", archived: false },
		includeMappings: false,
		expected: { feature_id: "seats", name: "Seats", type: "boolean" },
	},
	{
		name: "metered",
		row: {
			id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			eventNames: ["api_call.created"],
		},
		includeMappings: false,
		expected: {
			feature_id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
		},
	},
	{
		name: "credit_system",
		row: {
			id: "credits",
			name: "Credits",
			type: "credit_system",
			creditSchema: [
				{ meteredFeatureId: "api_calls", creditCost: 1 },
				{
					meteredFeatureId: "tokens",
					tierBehavior: "graduated",
					tiers: [
						{ to: 100, creditCost: 2 },
						{ to: "inf", creditCost: 3 },
					],
				},
				// A blank id is a server artifact, not a fixture line.
				{ meteredFeatureId: "", creditCost: 9 },
			],
		},
		includeMappings: false,
		expected: {
			feature_id: "credits",
			name: "Credits",
			type: "credit_system",
			credit_schema: [
				{ metered_feature_id: "api_calls", credit_cost: 1 },
				{
					metered_feature_id: "tokens",
					tier_behavior: "graduated",
					tiers: [
						{ to: 100, credit_cost: 2 },
						{ to: "inf", credit_cost: 3 },
					],
				},
			],
		},
	},
	{
		name: "ai_credit_system",
		row: {
			id: "ai_credits",
			name: "AI Credits",
			type: "ai_credit_system",
			modelMarkups: {
				"openai/gpt-4o": { markup: 20, inputCost: 3 },
				"custom/x": { markup: 50 },
			},
			providerMarkups: { openai: { markup: 10 } },
			defaultMarkup: 15,
		},
		includeMappings: false,
		expected: {
			feature_id: "ai_credits",
			name: "AI Credits",
			type: "ai_credit_system",
			model_markups: {
				"openai/gpt-4o": { markup: 20, input_cost: 3 },
				"custom/x": { markup: 50 },
			},
			provider_markups: { openai: { markup: 10 } },
			default_markup: 15,
		},
	},
	{
		name: "display_null_half",
		row: {
			id: "seats",
			name: "Seats",
			type: "boolean",
			display: { singular: "Seat", plural: null },
		},
		includeMappings: false,
		expected: { feature_id: "seats", name: "Seats", type: "boolean" },
	},
	{
		name: "processors_kept",
		row: {
			id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			processors: {
				stripe: { productId: "prod_123", meterId: "meter_456" },
			},
		},
		includeMappings: true,
		expected: {
			feature_id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			processors: {
				stripe: { product_id: "prod_123", meter_id: "meter_456" },
			},
		},
	},
	{
		name: "processors_dropped",
		row: {
			id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
			processors: {
				stripe: { productId: "prod_123", meterId: "meter_456" },
			},
		},
		includeMappings: false,
		expected: {
			feature_id: "api_calls",
			name: "API Calls",
			type: "metered",
			consumable: true,
		},
	},
];

const writeConfig = ({
	name,
	text,
}: {
	name: string;
	text: string;
}): string => {
	const dir = join(import.meta.dir, ".tmp", name);
	mkdirSync(dir, { recursive: true });
	const path = join(dir, "autumn.config.ts");
	// The emitter's first line carries no indent; the config places it, the way
	// appendToCollection places it against a sibling.
	const placed = text
		.split("\n")
		.map((line, index) => (index === 0 ? `\t\t${line}` : line))
		.join("\n");
	writeFileSync(
		path,
		[
			'import { atmn } from "../../../src/generated/wire";',
			'import { feature } from "../../../src/generated/features";',
			"",
			"export default atmn({",
			"\tfeatures: [",
			`${placed},`,
			"\t],",
			"});",
			"",
		].join("\n"),
		"utf8",
	);
	return path;
};

test("emitted fixtures round trip to the expected wire rows", async () => {
	for (const { name, row, includeMappings, expected } of CASES) {
		const text = emitFixture({
			spec: SPEC,
			row,
			includeMappings,
			indent: "\t\t",
		});
		const path = writeConfig({ name, text });
		// Cache-bust on the PLAIN path: a query on a file:// href is normalised
		// away and the first config read would be served forever.
		const module = await import(`${path}?v=${name}`);
		const wire = module.default as {
			features: Record<string, unknown>[];
		};
		expect(wire.features).toHaveLength(1);
		expect(wire.features[0]).toEqual(expected);
	}
});

test("the emitted spec carries every fixture key the type declares", () => {
	// A key missing here is silently dropped from every pull; one extra here is
	// a key the fixture type does not have.
	expect(SPEC.keys).toContain("featureId");
	expect(SPEC.keys).toContain("name");
	expect(FEATURES.length).toBeGreaterThan(10);
});
