import { disableEnvLocalFiles } from "../helpers/env-files.ts";
import { log } from "../helpers/shell.ts";

export function cmdDisable(): void {
	const { moved, missing, alreadyDisabled } = disableEnvLocalFiles();
	log(
		`disable: ${moved} renamed, ${alreadyDisabled} already disabled, ${missing} not present`,
	);
}
