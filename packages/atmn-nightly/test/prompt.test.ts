/**
 * The prompt layer: every question has a flag. Interactive asks; headless
 * prints the same line as a hint and stops with NeedsInputError.
 */

import { expect, test } from "bun:test";
import chalk from "chalk";
import {
	ask,
	choose,
	confirm,
	createPrompter,
	NeedsInputError,
} from "../src/prompt/prompt";
import { filterChoices, matchChoice, select } from "../src/prompt/select";

chalk.level = 0;

const capture = () => {
	const lines: string[] = [];
	return { lines, write: (text: string) => lines.push(text) };
};

test("a given value is returned without asking", async () => {
	const { lines, write } = capture();
	const prompter = createPrompter({ interactive: false, write });
	expect(
		await ask({
			prompter,
			value: "packages/autumn",
			question: "Where?",
			flag: "--path <dir>",
		}),
	).toBe("packages/autumn");
	expect(lines).toEqual([]);
});

test("headless prints the question and the flag, then stops", async () => {
	const { lines, write } = capture();
	const prompter = createPrompter({ interactive: false, write });
	await expect(
		ask({
			prompter,
			value: undefined,
			question: "Where should the Autumn package live?",
			flag: "--path <dir>",
			example: "--path packages/autumn",
		}),
	).rejects.toBeInstanceOf(NeedsInputError);
	expect(lines.join("")).toBe(
		"→ Where should the Autumn package live?\n  Provide --path <dir>, e.g. --path packages/autumn\n",
	);
});

test("interactive reads the answer, and enter takes the default", async () => {
	const { write } = capture();
	const answers = ["", "custom"];
	const prompter = createPrompter({
		interactive: true,
		write,
		readLine: async () => answers.shift() ?? null,
	});
	expect(
		await ask({
			prompter,
			value: undefined,
			question: "Name?",
			flag: "--name <name>",
			defaultValue: "autumn",
		}),
	).toBe("autumn");
	expect(
		await ask({
			prompter,
			value: undefined,
			question: "Name?",
			flag: "--name <name>",
		}),
	).toBe("custom");
});

test("confirm: headless hints the yes flag; interactive treats enter as yes", async () => {
	const headless = capture();
	await expect(
		confirm({
			prompter: createPrompter({ interactive: false, write: headless.write }),
			value: undefined,
			question: "Log in now?",
			flag: "--login",
		}),
	).rejects.toBeInstanceOf(NeedsInputError);
	expect(headless.lines.join("")).toBe(
		"→ Log in now?\n  Pass --login to continue\n",
	);

	const answers = ["", "n"];
	const prompter = createPrompter({
		interactive: true,
		write: () => {},
		readLine: async () => answers.shift() ?? null,
	});
	expect(
		await confirm({ prompter, value: undefined, question: "?", flag: "-y" }),
	).toBe(true);
	expect(
		await confirm({ prompter, value: undefined, question: "?", flag: "-y" }),
	).toBe(false);
});

const choices = [
	{ value: "abc123", label: "Pricing v2" },
	{ value: "def456", label: "QA" },
	{ value: "ghi789", label: "QA staging" },
];

test("filterChoices matches label or id, case-insensitively", () => {
	expect(filterChoices({ choices, filter: "qa" }).map((c) => c.value)).toEqual([
		"def456",
		"ghi789",
	]);
	expect(filterChoices({ choices, filter: "ABC" }).map((c) => c.value)).toEqual(
		["abc123"],
	);
});

test("matchChoice: exact id, exact name, then a unique prefix", () => {
	expect(matchChoice({ choices, query: "def456" })?.label).toBe("QA");
	expect(matchChoice({ choices, query: "qa" })?.value).toBe("def456");
	expect(matchChoice({ choices, query: "pric" })?.value).toBe("abc123");
	expect(matchChoice({ choices, query: "nope" })).toBeNull();
});

test("select in headless prints the table hint and returns null", async () => {
	const { lines, write } = capture();
	const picked = await select({
		prompter: createPrompter({ interactive: false, write }),
		choices,
		question: "Which sandbox?",
		flag: "atmn sandbox use <name|id>",
	});
	expect(picked).toBeNull();
	expect(lines.join("")).toBe(
		"→ Which sandbox?\n  atmn sandbox use <name|id>\n",
	);
});

test("choose: headless lists the flags and stops; interactive takes a number or enter", async () => {
	const options = [
		{ value: "login", flag: "--login", label: "sign in" },
		{ value: "keyless", flag: "--keyless", label: "no account" },
	] as const;
	const headless = capture();
	await expect(
		choose({
			prompter: createPrompter({ interactive: false, write: headless.write }),
			value: undefined,
			question: "How?",
			options,
			defaultValue: "login",
		}),
	).rejects.toThrow("Pass --login or --keyless");
	expect(headless.lines.join("")).toBe(
		"→ How?\n  --login    sign in\n  --keyless  no account\n",
	);

	const pick = async (answer: string) =>
		choose({
			prompter: createPrompter({
				interactive: true,
				write: () => {},
				readLine: async () => answer,
			}),
			value: undefined,
			question: "How?",
			options,
			defaultValue: "login",
		});
	expect(await pick("")).toBe("login");
	expect(await pick("2")).toBe("keyless");
	expect(await pick("--keyless")).toBe("keyless");
	await expect(pick("7")).rejects.toThrow(NeedsInputError);
});
