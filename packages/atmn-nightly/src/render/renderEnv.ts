import chalk from "chalk";
import type { OrgInfo } from "../actions/env/types/orgInfo";
import { stripTerminalControls } from "./stripTerminalControls";

const GAP = "  ";

const envLabel = ({ env }: { env: string }): string => {
	if (env === "sandbox") return "Sandbox";
	if (env === "live") return "Production";
	return env;
};

/**
 * A sandbox key authenticates as the sandbox's own org, so the id the server
 * answers with is the sandbox the key really unlocks. A pin whose key answers
 * as something else is a stale or copied key, and worth saying out loud.
 */
const sandboxCell = ({
	sandboxId,
	authenticatedId,
}: {
	sandboxId: string;
	authenticatedId: string;
}): string =>
	sandboxId === authenticatedId
		? sandboxId
		: `${sandboxId} ${chalk.yellow(`← key belongs to ${authenticatedId}`)}`;

/**
 * Headless rendering, like the sandbox table: a label column a terminal or a
 * CI log can read. Nothing here decides anything — it reports what the server
 * said about the key, plus where that key came from.
 */
export const renderEnv = ({
	info,
	secretKeyName,
	baseUrl,
	sandboxId,
}: {
	info: OrgInfo;
	/** The env var the key was read from; says which flag or pin picked it. */
	secretKeyName: string;
	/** Only shown when it is not the spec's server. */
	baseUrl?: string;
	sandboxId?: string;
}): string => {
	const rows: [string, string][] = [
		[
			"Organization",
			`${stripTerminalControls(info.name)} ${chalk.dim(`(${stripTerminalControls(info.slug)})`)}`,
		],
		["Environment", envLabel({ env: stripTerminalControls(info.env) })],
	];
	if (sandboxId !== undefined) {
		rows.push([
			"Sandbox",
			sandboxCell({
				sandboxId,
				authenticatedId: stripTerminalControls(info.id),
			}),
		]);
	}
	if (info.claim_state === "pending")
		rows.push([
			"Owner",
			`${chalk.yellow("unclaimed")} ${chalk.dim("(link with atmn login --claim <email>)")}`,
		]);
	if (info.user?.email !== undefined)
		rows.push(["User", stripTerminalControls(info.user.email)]);
	rows.push(["Key", secretKeyName]);
	if (baseUrl !== undefined) rows.push(["Server", baseUrl]);

	const width = Math.max(...rows.map(([label]) => label.length));
	return rows
		.map(([label, value]) => `${chalk.dim(label.padEnd(width))}${GAP}${value}`)
		.join("\n");
};
