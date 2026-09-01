import chalk from "chalk";
import type { Arm } from "../types/arm.ts";
import type { AxScore } from "./types/axScore.ts";

const mark = (score: number | null) =>
	score === null
		? chalk.dim("·")
		: score >= 1
			? chalk.green("✓")
			: chalk.red("✗");

/**
 * Collects scores as Braintrust computes them and prints one scorecard per
 * arm when it completes, plus a delta footer when every arm is in.
 */
export const renderScorecard = ({
	arms,
	expectationCount,
}: {
	arms: Arm[];
	expectationCount: number;
}) => {
	const byArm = new Map<Arm, AxScore[]>();
	let armsPrinted = 0;

	const record = (arm: Arm, score: AxScore) => {
		const scores = byArm.get(arm) ?? [];
		scores.push(score);
		byArm.set(arm, scores);
		if (scores.length !== expectationCount) return;

		// One expectation per line: failures in red so they pop, passes dimmed.
		const passedCount = scores.filter((entry) => entry.score === 1).length;
		const gradedCount = scores.filter((entry) => entry.score !== null).length;
		const lines = scores
			.map((entry) => {
				const name =
					entry.score === 0 ? chalk.red(entry.name) : chalk.dim(entry.name);
				const why =
					entry.score === 0 && typeof entry.metadata?.why === "string"
						? chalk.dim(` — ${entry.metadata.why}`)
						: "";
				return `  ${mark(entry.score)} ${name}${why}`;
			})
			.join("\n");
		process.stderr.write(
			`\n${chalk.bold(`scores · ${arm}`)} ${chalk.dim(`${passedCount}/${gradedCount}`)}\n${lines}\n`,
		);

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
