/**
 * The lint runs over the whole fixture tree, before anything is sent. These
 * tests run the GENERATED module against real fixtures, so they prove what a
 * user's config is refused for — not what the emitter meant to emit.
 */

import { expect, test } from "bun:test";
import { feature } from "../src/generated/features";
import { ConfigError } from "../src/generated/lintRuntime";
import { atmn } from "../src/generated/wire";

const issuesOf = (run: () => unknown): { path: string; message: string }[] => {
	try {
		run();
	} catch (error) {
		if (error instanceof ConfigError) return error.issues;
		throw error;
	}
	return [];
};

test("a valid config lints clean", () => {
	expect(() =>
		atmn({
			features: [
				feature({ featureId: "seats", name: "Seats", type: "boolean" }),
				feature({
					featureId: "messages",
					name: "Messages",
					type: "metered",
					consumable: true,
				}),
			],
		}),
	).not.toThrow();
});

test("a nested fixture is linted and named by its breadcrumb", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({
					featureId: "credits",
					name: "Credits",
					type: "credit_system",
					creditSchema: [
						// Graduated, but no tiers: the anyOf branch that `tierBehavior`
						// selects requires them.
						{
							meteredFeatureId: "messages",
							tierBehavior: "graduated",
						} as never,
					],
				}),
			],
		}),
	);

	expect(issues).toEqual([
		{
			path: 'feature "credits" › creditSchema[0]',
			message: "tiers is required.",
		},
	]);
});

test("a flat credit line is not asked for the graduated branch's fields", () => {
	// Unioning `required` across anyOf branches would demand tiers AND creditCost
	// on every line. Branches are alternatives.
	expect(() =>
		atmn({
			features: [
				feature({
					featureId: "credits",
					name: "Credits",
					type: "credit_system",
					creditSchema: [{ meteredFeatureId: "messages", creditCost: 2 }],
				}),
			],
		}),
	).not.toThrow();
});

test("record keys are checked against the spec's key pattern", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({
					featureId: "ai",
					name: "AI",
					type: "ai_credit_system",
					modelMarkups: { "gpt-4o": { markup: 20 } },
				}),
			],
		}),
	);

	expect(issues).toHaveLength(1);
	expect(issues[0]?.path).toBe('feature "ai"');
	expect(issues[0]?.message).toContain('modelMarkups key "gpt-4o"');
});

test("zod bounds survive as lint: a markup below -100", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({
					featureId: "ai",
					name: "AI",
					type: "ai_credit_system",
					modelMarkups: { "openai/gpt-4o": { markup: -150 } },
				}),
			],
		}),
	);

	expect(issues).toEqual([
		{
			path: 'feature "ai" › modelMarkups["openai/gpt-4o"]',
			message: "markup must be at least -100 — got -150.",
		},
	]);
});

test("every problem is reported at once, in document order", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({ featureId: "a", name: "A", type: "metered" }),
				feature({ featureId: "b", name: "B", type: "metred" as never }),
			],
		}),
	);

	expect(issues.map((issue) => issue.path)).toEqual([
		'feature "a"',
		'feature "b"',
	]);
	expect(issues[0]?.message).toStartWith(
		'consumable is required when type is "metered".',
	);
	expect(issues[1]?.message).toStartWith("type must be one of");
});

test("two features claiming one id are refused", () => {
	const issues = issuesOf(() =>
		atmn({
			features: [
				feature({ featureId: "seats", name: "Seats", type: "boolean" }),
				feature({ featureId: "seats", name: "Seats again", type: "boolean" }),
			],
		}),
	);

	expect(issues).toEqual([
		{
			path: 'feature "seats"',
			message:
				'featureId "seats" is used more than once. Two features claiming one id race to define the same row.',
		},
	]);
});
