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
