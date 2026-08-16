import { killOwnPorts } from "../helpers/ports.ts";
import { fatal } from "../helpers/shell.ts";
import { startDev } from "../helpers/start.ts";
import { cmdSetup } from "./setup.ts";

export async function cmdRun(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const entry = await cmdSetup();
	killOwnPorts(entry.worktreeNum);
	await startDev(entry, { allowTmux: false });
}
