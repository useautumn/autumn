import { killOwnPorts } from "../helpers/ports.ts";
import { resolveCurrentEntryOrFatal } from "../helpers/registry.ts";
import { fatal } from "../helpers/shell.ts";
import { startDev } from "../helpers/start.ts";

export async function cmdRun(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const entry = resolveCurrentEntryOrFatal("bun dw run", { touch: true });
	killOwnPorts(entry.worktreeNum);
	await startDev(entry, { allowTmux: false });
}
