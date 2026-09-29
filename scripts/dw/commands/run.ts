import { balanceWorkerPortFor, killOwnPorts } from "../helpers/ports.ts";
import { resolveCurrentEntryOrFatal } from "../helpers/registry.ts";
import { fatal } from "../helpers/shell.ts";
import { startDev } from "../helpers/start.ts";
import { stopBalanceWorker } from "../helpers/stopBalanceWorker.ts";

export async function cmdRun(): Promise<void> {
	if (process.env.NODE_ENV === "production") {
		fatal("bun dw is disabled in production");
	}

	const entry = resolveCurrentEntryOrFatal("bun dw run", { touch: true });
	await stopBalanceWorker({
		port: balanceWorkerPortFor(entry.worktreeNum),
		worktreeNum: entry.worktreeNum,
	});
	killOwnPorts(entry.worktreeNum);
	await startDev(entry, { allowTmux: false });
}
