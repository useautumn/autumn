import { enableEnvLocalFiles } from "../helpers/env-files.ts";
import { log } from "../helpers/shell.ts";

export function cmdEnable(): void {
	const { moved, missing, alreadyEnabled } = enableEnvLocalFiles();
	log(
		`enable: ${moved} restored, ${alreadyEnabled} already enabled, ${missing} not present`,
	);
}
