import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { herdrConfigPath, STABLE_DIR, STABLE_WRAPPER } from "../constants.ts";
import { log, shInherit } from "../helpers/shell.ts";

/** Drop the `default_shell` line only if it points at our installed wrapper. */
function removeOurDefaultShell(toml: string): string {
	return toml
		.split(/\r?\n/)
		.filter(
			(line) =>
				!(/^\s*default_shell\s*=/.test(line) && line.includes(STABLE_WRAPPER)),
		)
		.join("\n");
}

/** Reverse `sw install`: restore the default shell and drop the wrapper. */
export function cmdUninstall(): void {
	const configPath = herdrConfigPath();
	if (existsSync(configPath)) {
		writeFileSync(
			configPath,
			removeOurDefaultShell(readFileSync(configPath, "utf8")),
		);
		log(`removed our default_shell from ${configPath}`);
	}
	rmSync(STABLE_DIR, { recursive: true, force: true });
	shInherit("herdr", ["server", "reload-config"]);
	log("uninstalled. herdr panes fall back to your real shell.");
}
