import { log } from "../helpers/shell.ts";
import { disableEnvLocalFiles } from "../helpers/env-files.ts";

export function cmdDisable(): void {
	const { moved, missing, alreadyDisabled } = disableEnvLocalFiles();
	log(
		`disable: ${moved} renamed, ${alreadyDisabled} already disabled, ${missing} not present`,
	);
}
