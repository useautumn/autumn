import chalk from "chalk";
import type { ProbeResult } from "./fixtureProbe.ts";
import type { OracleCustomer } from "./sandboxOracle.ts";

/** Colorized unified diff, hunk headers and context dimmed, ± colored.
 * File-header noise ("Only in …", index lines) is dropped. */
export const renderDiff = (diff: string): string =>
	diff
		.split("\n")
		.filter((line) => !line.startsWith("Only in ") && !line.startsWith("diff "))
		.map((line) => {
			if (line.startsWith("+++") || line.startsWith("---"))
				return chalk.bold(line);
			if (line.startsWith("@@")) return chalk.cyan(line);
			if (line.startsWith("+")) return chalk.green(line);
			if (line.startsWith("-")) return chalk.red(line);
			return chalk.dim(line);
		})
		.join("\n");

const statusColor = (status: number) =>
	status >= 200 && status < 300
		? chalk.green
		: status >= 400 && status < 500
			? chalk.yellow
			: chalk.red;

export const renderProbe = (probe: ProbeResult): string => {
	if (!probe.booted)
		return `${chalk.red("app failed to boot")}\n${chalk.dim(probe.bootError ?? "(no stderr)")}`;
	return probe.calls
		.map((call, index) => {
			const body = JSON.stringify(call.body) ?? "";
			const shownBody = body.length > 100 ? `${body.slice(0, 100)}…` : body;
			return `${chalk.dim(`${index + 1}.`)} ${call.path} ${statusColor(call.status)(String(call.status))} ${chalk.dim(shownBody)}`;
		})
		.join("\n");
};

/** One line per fact — not the raw customer JSON. */
export const renderOracle = (oracle: OracleCustomer): string => {
	if (!oracle.found) return chalk.red("customer NOT found in org");
	const balances = Object.entries(oracle.balances)
		.map(([featureId, balance]) => {
			const used = balance.usage ?? 0;
			const granted = balance.granted ?? 0;
			return `${featureId} ${used}/${granted} used`;
		})
		.join(" · ");
	return [
		`${chalk.green("customer ✓")} ${oracle.email ?? oracle.id}`,
		`plans: ${chalk.cyan(oracle.planIds.join(", ") || "(none)")}`,
		balances || "(no balances)",
	].join(chalk.dim(" · "));
};

export const renderIntegrationRun = ({
	arm,
	diff,
	probe,
	oracle,
}: {
	arm: string;
	diff: string;
	probe: ProbeResult;
	oracle: OracleCustomer;
}): string => {
	const header = (label: string) => chalk.bold(`\n── ${label} (${arm}) `);
	const sections = [
		header("agent's changes") +
			(diff.trim() ? `\n${renderDiff(diff)}` : chalk.dim("none — fixture untouched")),
		header("probe") + `\n${renderProbe(probe)}`,
		header("oracle") + `\n${renderOracle(oracle)}`,
	];
	return `${sections.join("\n")}\n`;
};
