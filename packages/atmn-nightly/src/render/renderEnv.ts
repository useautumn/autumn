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
			`${stripTerminalControls(info.name)} ${chalk.dim(`(${info.slug})`)}`,
		],
		["Environment", envLabel({ env: info.env })],
	];
	if (sandboxId !== undefined) rows.push(["Sandbox", sandboxId]);
	if (info.user?.email !== undefined) rows.push(["User", info.user.email]);
	rows.push(["Key", secretKeyName]);
	if (baseUrl !== undefined) rows.push(["Server", baseUrl]);

	const width = Math.max(...rows.map(([label]) => label.length));
	return rows
		.map(([label, value]) => `${chalk.dim(label.padEnd(width))}${GAP}${value}`)
		.join("\n");
};
