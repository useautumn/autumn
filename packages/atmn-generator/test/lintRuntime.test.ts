/**
 * The walker, driven with hand-built rules. It is a real file here, so it is
 * tested directly; the generated copy is exercised from atmn-nightly.
 */

import { expect, test } from "bun:test";
import {
	type LintHints,
	type LintRules,
	lintDocument,
} from "../src/lint/runtime/lintDocument";

const noHints: LintHints = { recordPaths: new Set(), frozenPaths: new Set() };

const lint = ({
	document,
	rules,
	hints = noHints,
}: {
	document: Record<string, unknown>;
	rules: LintRules;
	hints?: LintHints;
}) => lintDocument({ document, rules, hints });

test("entries are named by label and id, falling back to the key and index", () => {
	const issues = lint({
		document: { pets: [{ petId: "rex" }, { nickname: "anon" }], toys: [{}] },
		rules: {
			pets: { label: "pet", idField: "petId", required: ["name"] },
			toys: { required: ["name"] },
		},
	});
	expect(issues.map((issue) => issue.path)).toEqual([
		'pet "rex"',
		"pet[1]",
		"toys[0]",
	]);
});

test("every constraint kind has a message", () => {
	const issues = lint({
		document: {
			things: [
				{
					kind: "nope",
					count: -1,
					ratio: 0,
					name: "",
					code: "x y",
					tags: [],
				},
			],
		},
		rules: {
			things: {
				fields: {
					kind: { enum: ["a", "b"] },
					count: { minimum: 0 },
					ratio: { exclusiveMinimum: 0 },
					name: { minLength: 1 },
					code: { pattern: "^[a-z]+$" },
					tags: { minItems: 1 },
				},
			},
		},
	});
	expect(issues.map((issue) => issue.message)).toEqual([
		'kind must be one of "a", "b" — got "nope".',
		"count must be at least 0 — got -1.",
		"ratio must be greater than 0 — got 0.",
		"name must not be empty.",
		'code must match ^[a-z]+$ — got "x y".',
		"tags must have at least 1 entry.",
	]);
});

test("a variant is chosen by its discriminator; a typo names the options", () => {
	const rules: LintRules = {
		lines: {
			variants: {
				on: "shape",
				byValue: { tiered: { required: ["tiers"] } },
				fallback: { required: ["amount"] },
			},
		},
	};
	const messagesFor = (line: Record<string, unknown>) =>
		lint({ document: { lines: [line] }, rules }).map((issue) => issue.message);

	expect(messagesFor({ shape: "tiered", tiers: [] })).toEqual([]);
	expect(messagesFor({ shape: "tiered" })).toEqual(["tiers is required."]);
	expect(messagesFor({ amount: 1 })).toEqual([]);
	expect(messagesFor({})).toEqual(["amount is required."]);
	expect(messagesFor({ shape: "teired" })).toEqual([
		'shape must be one of "tiered" — got "teired".',
	]);
});

test("record keys are checked and record values walked, frozen subtrees skipped", () => {
	const issues = lint({
		document: {
			items: [
				{
					markups: { "bad key": { rate: -5 } },
					metadata: { rate: -5 },
				},
			],
		},
		rules: {
			"items.markups": { keys: { pattern: "^[a-z/]+$" } },
			"items.markups.*": { fields: { rate: { minimum: 0 } } },
			"items.metadata": { fields: { rate: { minimum: 0 } } },
		},
		hints: {
			recordPaths: new Set(["items.markups"]),
			frozenPaths: new Set(["items.metadata"]),
		},
	});
	expect(issues).toEqual([
		{
			path: "items[0]",
			message: 'markups key "bad key" must match ^[a-z/]+$ — got "bad key".',
		},
		{
			path: 'items[0] › markups["bad key"]',
			message: "rate must be at least 0 — got -5.",
		},
	]);
});

test("requiredWhen fires only when the selector matches", () => {
	const rules: LintRules = {
		features: {
			rules: [
				{
					kind: "requiredWhen",
					when: "type",
					equals: "metered",
					require: ["consumable"],
					because: "Because.",
				},
			],
		},
	};
	const messagesFor = (entry: Record<string, unknown>) =>
		lint({ document: { features: [entry] }, rules }).map((i) => i.message);

	expect(messagesFor({ type: "boolean" })).toEqual([]);
	expect(messagesFor({ type: "metered", consumable: false })).toEqual([]);
	expect(messagesFor({ type: "metered" })).toEqual([
		'consumable is required when type is "metered". Because.',
	]);
});

// --- the rule vocabulary: each kind fires, and stays quiet when satisfied ---

const messagesWith = ({
	rules,
	entry,
	document = {},
}: {
	rules: LintRules[string]["rules"];
	entry: Record<string, unknown>;
	document?: Record<string, unknown>;
}) =>
	lint({
		document: { ...document, things: [entry] },
		rules: { things: { rules } },
	}).map((issue) => issue.message);

test("forbiddenWhen", () => {
	const rules = [
		{
			kind: "forbiddenWhen" as const,
			when: "type",
			equals: "boolean",
			forbid: ["creditSchema"],
			because: "Because.",
		},
	];
	expect(messagesWith({ rules, entry: { type: "boolean" } })).toEqual([]);
	expect(
		messagesWith({ rules, entry: { type: "metered", creditSchema: [] } }),
	).toEqual([]);
	expect(
		messagesWith({ rules, entry: { type: "boolean", creditSchema: [] } }),
	).toEqual(['creditSchema cannot be set when type is "boolean". Because.']);
});

test("mutex and exactlyOne", () => {
	const mutex = [
		{ kind: "mutex" as const, fields: ["amount", "tiers"], because: "M." },
	];
	expect(messagesWith({ rules: mutex, entry: {} })).toEqual([]);
	expect(messagesWith({ rules: mutex, entry: { amount: 1 } })).toEqual([]);
	expect(
		messagesWith({ rules: mutex, entry: { amount: 1, tiers: [] } }),
	).toEqual(["amount and tiers cannot be set together. M."]);

	const one = [
		{ kind: "exactlyOne" as const, fields: ["amount", "tiers"], because: "O." },
	];
	expect(messagesWith({ rules: one, entry: { tiers: [] } })).toEqual([]);
	expect(messagesWith({ rules: one, entry: {} })).toEqual([
		"One of amount and tiers is required. O.",
	]);
	expect(messagesWith({ rules: one, entry: { amount: 1, tiers: [] } })).toEqual(
		["amount and tiers cannot be set together. O."],
	);
});

test("unique reports every repeat on the repeating entry", () => {
	const issues = lint({
		document: { things: [{ id: "a" }, { id: "b" }, { id: "a" }, { id: "a" }] },
		rules: {
			things: {
				label: "thing",
				idField: "id",
				rules: [{ kind: "unique", field: "id", because: "U." }],
			},
		},
	});
	expect(issues).toEqual([
		{ path: 'thing "a"', message: 'id "a" is used more than once. U.' },
		{ path: 'thing "a"', message: 'id "a" is used more than once. U.' },
	]);
});

test("exists checks a present collection and skips an absent one", () => {
	const rules = [
		{
			kind: "exists" as const,
			field: "featureId",
			in: "features",
			matching: "featureId",
			because: "E.",
		},
	];
	const entry = { featureId: "seats" };
	expect(
		messagesWith({
			rules,
			entry,
			document: { features: [{ featureId: "seats" }] },
		}),
	).toEqual([]);
	expect(
		messagesWith({
			rules,
			entry,
			document: { features: [{ featureId: "other" }] },
		}),
	).toEqual(['featureId "seats" is not in features. E.']);
	// Omitted means "not mine": the feature may well exist on the server.
	expect(messagesWith({ rules, entry, document: {} })).toEqual([]);
});

test("valueWhen", () => {
	const rules = [
		{
			kind: "valueWhen" as const,
			when: "tierBehavior",
			equals: "volume",
			field: "billingMethod",
			mustBe: "prepaid",
			because: "Because.",
		},
	];
	expect(messagesWith({ rules, entry: { tierBehavior: "graduated" } })).toEqual(
		[],
	);
	expect(
		messagesWith({
			rules,
			entry: { tierBehavior: "volume", billingMethod: "prepaid" },
		}),
	).toEqual([]);
	expect(messagesWith({ rules, entry: { tierBehavior: "volume" } })).toEqual(
		[],
	);
	expect(
		messagesWith({
			rules,
			entry: { tierBehavior: "volume", billingMethod: "usage_based" },
		}),
	).toEqual([
		'billingMethod must be "prepaid" when tierBehavior is "volume". Because.',
	]);
});

test("targetHas checks a present collection, skips an absent one or an unmatched row", () => {
	const rules = [
		{
			kind: "targetHas" as const,
			when: "featureOverride",
			field: "featureId",
			in: "features",
			matching: "featureId",
			target: "type",
			equals: "credit_system",
			because: "Because.",
		},
	];
	const entry = { featureId: "seats", featureOverride: {} };
	expect(messagesWith({ rules, entry: { featureId: "seats" } })).toEqual([]);
	expect(
		messagesWith({
			rules,
			entry,
			document: { features: [{ featureId: "seats", type: "credit_system" }] },
		}),
	).toEqual([]);
	// Omitted means "not mine": the exists rule owns unmatched references.
	expect(messagesWith({ rules, entry, document: {} })).toEqual([]);
	expect(
		messagesWith({
			rules,
			entry,
			document: { features: [{ featureId: "other", type: "metered" }] },
		}),
	).toEqual([]);
	expect(
		messagesWith({
			rules,
			entry,
			document: { features: [{ featureId: "seats", type: "metered" }] },
		}),
	).toEqual([
		'featureOverride needs features "seats" to have type "credit_system" — got "metered". Because.',
	]);
});

test("targetLacks checks a present collection, skips a guarded parent or an unmatched row", () => {
	const rules = [
		{
			kind: "targetLacks" as const,
			field: "featureId",
			in: "features",
			matching: "featureId",
			target: "archived",
			label: "Feature",
			parentGuard: "archived",
			parentIdField: "planId",
			parentLabel: "plan",
			because: "Because.",
		},
	];
	const lint = ({
		document,
		parentEntry,
	}: {
		document: Record<string, unknown>;
		parentEntry?: Record<string, unknown>;
	}) =>
		lintDocument({
			document: {
				...document,
				plans: [
					{ planId: "pro", ...parentEntry, items: [{ featureId: "seats" }] },
				],
			},
			rules: { "plans.items": { rules } },
			hints: noHints,
		}).map((issue) => issue.message);

	expect(
		lint({ document: { features: [{ featureId: "seats", archived: true }] } }),
	).toEqual([
		'Feature "seats" is archived. Unarchive it, or archive plan "pro". Because.',
	]);
	// The referenced feature is not archived: nothing to flag.
	expect(
		lint({ document: { features: [{ featureId: "seats", archived: false }] } }),
	).toEqual([]);
	// An archived plan may reference an archived feature freely.
	expect(
		lint({
			document: { features: [{ featureId: "seats", archived: true }] },
			parentEntry: { archived: true },
		}),
	).toEqual([]);
	// Omitted means "not mine": the exists rule owns unmatched references.
	expect(lint({ document: {} })).toEqual([]);
});

test("compare", () => {
	const rules = [
		{
			kind: "compare" as const,
			field: "included",
			op: "<=" as const,
			than: "limit",
			because: "C.",
		},
	];
	expect(messagesWith({ rules, entry: { included: 5, limit: 10 } })).toEqual(
		[],
	);
	expect(messagesWith({ rules, entry: { included: 5 } })).toEqual([]);
	expect(messagesWith({ rules, entry: { included: 50, limit: 10 } })).toEqual([
		"included must be at most limit — got 50 and 10. C.",
	]);
});
