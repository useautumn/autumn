import chalk from "chalk";
import type { Arm } from "../types/arm.ts";
import type { AxScore } from "./types/axScore.ts";

const mark = (score: number | null) =>
	score === null
		? chalk.dim("·")
		: score >= 1
			? chalk.green("✓")
			: chalk.red("✗");

const flat = (value: unknown) =>
	String(value ?? "")
		.replaceAll("\n", " ⏎ ")
		.slice(0, 300);

const failureDetail = (entry: AxScore): string => {
	if (entry.score !== 0 || !entry.metadata) return "";
	const lines: string[] = [];
	const { parseError, validationErrors, closestPlan, fields } =
		entry.metadata as {
			parseError?: string;
			validationErrors?: string[];
			closestPlan?: string;
			fields?: Record<string, string>;
		};
	if (parseError) lines.push(`      ${flat(parseError)}`);
	for (const error of validationErrors ?? [])
		lines.push(`      ${flat(error)}`);
	if (fields) {
		lines.push(`      closest plan: ${String(closestPlan)}`);
		for (const [field, verdict] of Object.entries(fields))
			lines.push(`      ${field}: ${flat(verdict)}`);
	}
	return lines.length > 0 ? chalk.dim(`\n${lines.join("\n")}`) : "";
};

export const renderScorecard = ({
	arms,
	expectationCount,
	caseName,
}: {
	arms: Arm[];
	expectationCount: number;
	caseName?: string;
}) => {
	const byArm = new Map<Arm, AxScore[]>();
	let armsPrinted = 0;
	const compact = process.env.AX_EVALS_COMPACT === "1";

	const record = (arm: Arm, score: AxScore) => {
		const scores = byArm.get(arm) ?? [];
		scores.push(score);
		byArm.set(arm, scores);
		if (scores.length !== expectationCount) return;

		const passedCount = scores.filter((entry) => entry.score === 1).length;
		const gradedCount = scores.filter((entry) => entry.score !== null).length;
		if (compact) {
			const failures = scores.filter((entry) => entry.score === 0);
			const verdict =
				failures.length === 0
					? chalk.green(`✓ ${passedCount}/${gradedCount}`)
					: chalk.red(`✗ ${passedCount}/${gradedCount}`);
			const failureLines = failures
				.map((entry) => {
					const why =
						typeof entry.metadata?.why === "string"
							? chalk.dim(` — ${entry.metadata.why}`)
							: "";
					return `    ${chalk.red("✗")} ${chalk.red(entry.name)}${why}${failureDetail(entry)}`;
				})
				.join("\n");
			process.stderr.write(
				`${verdict} ${chalk.bold(caseName ?? "")} ${chalk.dim(`· ${arm}`)}${failureLines ? `\n${failureLines}` : ""}\n`,
			);
		} else {
			const lines = scores
				.map((entry) => {
					const name =
						entry.score === 0 ? chalk.red(entry.name) : chalk.dim(entry.name);
					const why =
						entry.score === 0 && typeof entry.metadata?.why === "string"
							? chalk.dim(` — ${entry.metadata.why}`)
							: "";
					return `  ${mark(entry.score)} ${name}${why}${failureDetail(entry)}`;
				})
				.join("\n");
			process.stderr.write(
				`\n${chalk.bold(`scores · ${arm}`)} ${chalk.dim(`${passedCount}/${gradedCount}`)}\n${lines}\n`,
			);
		}

		armsPrinted += 1;
		if (armsPrinted === arms.length && arms.length > 1) {
			const passed = (name: Arm) =>
				(byArm.get(name) ?? []).filter((entry) => entry.score === 1).length;
			const graded = (name: Arm) =>
				(byArm.get(name) ?? []).filter((entry) => entry.score !== null).length;
			const summaryLine = arms
				.map((name) => `${name} ${passed(name)}/${graded(name)}`)
				.join(" · ");
			process.stderr.write(`\n${chalk.bold.cyan(`Δ  ${summaryLine}`)}\n\n`);
		}
	};

	return { record };
};
