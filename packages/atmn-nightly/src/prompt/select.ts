import chalk from "chalk";
import { hint, needs, type Prompter } from "./prompt";

export type Choice = {
	/** What is matched by the filter and returned. */
	value: string;
	/** Printed in white. */
	label: string;
	/** Printed dim in brackets. */
	detail?: string;
	current?: boolean;
};

const PAGE_SIZE = 10;

const CURRENT_MARKER = "← current";

export const renderChoices = ({
	choices,
	cursor,
	filter,
}: {
	choices: Choice[];
	cursor: number;
	filter: string;
}): string => {
	const visible = filterChoices({ choices, filter });
	const page = Math.floor(cursor / PAGE_SIZE);
	const start = page * PAGE_SIZE;
	const rows = visible.slice(start, start + PAGE_SIZE).map((choice, index) => {
		const selected = start + index === cursor;
		const pointer = selected ? chalk.cyan("❯") : " ";
		const label = selected ? chalk.bold(choice.label) : choice.label;
		const detail =
			choice.detail === undefined ? "" : ` ${chalk.dim(`(${choice.detail})`)}`;
		const current = choice.current ? ` ${chalk.dim(CURRENT_MARKER)}` : "";
		return `${pointer} ${label}${detail}${current}`;
	});
	const footer =
		visible.length > PAGE_SIZE
			? chalk.dim(
					`  ${start + 1}-${Math.min(start + PAGE_SIZE, visible.length)} of ${visible.length}`,
				)
			: "";
	const search = `  ${chalk.dim("type to filter:")} ${filter}`;
	return [...rows, ...(footer ? [footer] : []), search].join("\n");
};

export const filterChoices = ({
	choices,
	filter,
}: {
	choices: Choice[];
	filter: string;
}): Choice[] => {
	const needle = filter.trim().toLowerCase();
	if (needle === "") return choices;
	return choices.filter(
		(choice) =>
			choice.label.toLowerCase().includes(needle) ||
			choice.value.toLowerCase().includes(needle),
	);
};

/** A name or id typed by an agent: exact id first, then exact label, then a unique prefix. */
export const matchChoice = ({
	choices,
	query,
}: {
	choices: Choice[];
	query: string;
}): Choice | null => {
	const byValue = choices.find((choice) => choice.value === query);
	if (byValue) return byValue;
	const lower = query.toLowerCase();
	const byLabel = choices.filter(
		(choice) => choice.label.toLowerCase() === lower,
	);
	if (byLabel.length === 1) return byLabel[0] ?? null;
	const byPrefix = filterChoices({ choices, filter: query });
	return byPrefix.length === 1 ? (byPrefix[0] ?? null) : null;
};

const ESC = "\u001b";

/**
 * Arrow keys move, typing filters, enter picks. Raw-mode stdin, redrawn in
 * place. Headless callers never get here: `select` prints the hint instead.
 */
const interactiveSelect = async ({
	choices,
	write,
}: {
	choices: Choice[];
	write: (text: string) => void;
}): Promise<Choice | null> => {
	const stdin = process.stdin;
	let cursor = Math.max(
		0,
		choices.findIndex((choice) => choice.current),
	);
	let filter = "";
	let lines = 0;

	const draw = () => {
		if (lines > 0) write(`${ESC}[${lines}A${ESC}[J`);
		const text = renderChoices({ choices, cursor, filter });
		lines = text.split("\n").length;
		write(`${text}\n`);
	};

	return new Promise((resolve) => {
		stdin.setRawMode?.(true);
		stdin.resume();
		stdin.setEncoding("utf8");
		draw();
		const finish = (choice: Choice | null) => {
			stdin.off("data", onData);
			stdin.setRawMode?.(false);
			stdin.pause();
			resolve(choice);
		};
		const onData = (key: string) => {
			const visible = filterChoices({ choices, filter });
			if (key === "\u0003" || key === `${ESC}`) return finish(null);
			if (key === "\r" || key === "\n") return finish(visible[cursor] ?? null);
			if (key === `${ESC}[A`) cursor = Math.max(0, cursor - 1);
			else if (key === `${ESC}[B`)
				cursor = Math.min(Math.max(0, visible.length - 1), cursor + 1);
			else if (key === "\u007f" || key === "\b") {
				filter = filter.slice(0, -1);
				cursor = 0;
			} else if (key.length === 1 && key >= " ") {
				filter += key;
				cursor = 0;
			}
			draw();
		};
		stdin.on("data", onData);
	});
};

export const select = async ({
	prompter,
	choices,
	question,
	flag,
}: {
	prompter: Prompter;
	choices: Choice[];
	question: string;
	/** `atmn sandbox use <name|id>`: what a headless caller runs instead. */
	flag: string;
}): Promise<Choice | null> => {
	if (!prompter.interactive) {
		prompter.write(`${needs(question)}\n${hint(flag)}\n`);
		return null;
	}
	prompter.write(`${needs(question)}\n`);
	return interactiveSelect({ choices, write: prompter.write });
};
