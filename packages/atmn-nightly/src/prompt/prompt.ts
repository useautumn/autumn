import chalk from "chalk";

/** Where a command writes its lines. Injected so tests can capture it. */
export type WriteLine = (text: string) => void;

/**
 * Every prompt has a flag. In a terminal the question is asked inline; with
 * `--headless`, or no TTY, the same line is printed as a hint and the command
 * stops there, so an agent reads what to pass and runs again.
 */
export type Prompter = {
	interactive: boolean;
	write: WriteLine;
	/** The stdin reader used by interactive prompts; injected for tests. */
	readLine: () => Promise<string | null>;
};

export const done = (text: string): string => `${chalk.green("✓")} ${text}`;
export const needs = (text: string): string => `${chalk.cyan("→")} ${text}`;
export const soft = (text: string): string => `${chalk.yellow("!")} ${text}`;
export const same = (text: string): string => `${chalk.dim("=")} ${text}`;
export const hint = (text: string): string => `  ${chalk.cyan(text)}`;

/** Thrown when a headless run stops at a prompt; the CLI exits 0 on it. */
export class NeedsInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NeedsInputError";
	}
}

export const defaultReadLine = async (): Promise<string | null> => {
	const { createInterface } = await import("node:readline");
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	return new Promise((resolve) => {
		rl.once("close", () => resolve(null));
		rl.question("", (answer) => {
			rl.close();
			resolve(answer);
		});
	});
};

export const createPrompter = ({
	interactive,
	write = (text) => process.stdout.write(text),
	readLine = defaultReadLine,
}: {
	interactive: boolean;
	write?: WriteLine;
	readLine?: () => Promise<string | null>;
}): Prompter => ({ interactive, write, readLine });

/**
 * A value the command needs. Given → returned as is. Absent and interactive →
 * asked, the flag's example as the placeholder. Absent and headless → the
 * `→` line and the flag hint are printed and the run stops.
 */
export const ask = async ({
	prompter,
	value,
	question,
	flag,
	example,
	defaultValue,
}: {
	prompter: Prompter;
	value: string | undefined;
	question: string;
	/** `--path <dir>`: what a headless caller passes. */
	flag: string;
	example?: string;
	/** Enter with nothing typed picks this; headless never assumes it. */
	defaultValue?: string;
}): Promise<string> => {
	if (value !== undefined && value !== "") return value;
	const flagHint = `Provide ${flag}${example === undefined ? "" : `, e.g. ${example}`}`;
	if (!prompter.interactive) {
		prompter.write(`${needs(question)}\n${hint(flagHint)}\n`);
		throw new NeedsInputError(flagHint);
	}
	const placeholder =
		defaultValue !== undefined
			? chalk.dim(` (${defaultValue})`)
			: example !== undefined
				? chalk.dim(` (e.g. ${example})`)
				: "";
	prompter.write(`${needs(question)}${placeholder} `);
	const answer = (await prompter.readLine())?.trim() ?? "";
	if (answer !== "") return answer;
	if (defaultValue !== undefined) return defaultValue;
	throw new NeedsInputError(flagHint);
};

/** A yes/no. Headless prints the hint for the flag that says yes and stops. */
export const confirm = async ({
	prompter,
	value,
	question,
	flag,
}: {
	prompter: Prompter;
	value: boolean | undefined;
	question: string;
	flag: string;
}): Promise<boolean> => {
	if (value !== undefined) return value;
	if (!prompter.interactive) {
		prompter.write(`${needs(question)}\n${hint(`Pass ${flag} to continue`)}\n`);
		throw new NeedsInputError(`Pass ${flag} to continue`);
	}
	prompter.write(`${needs(question)} ${chalk.dim("[Y/n]")} `);
	const answer = (await prompter.readLine())?.trim().toLowerCase() ?? "";
	return answer === "" || answer === "y" || answer === "yes";
};
