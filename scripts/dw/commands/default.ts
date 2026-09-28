import { balanceWorkerPortFor, killOwnPorts } from "../helpers/ports.ts";
import { startDev } from "../helpers/start.ts";
import { stopBalanceWorker } from "../helpers/stopBalanceWorker.ts";
import { cmdSetup } from "./setup.ts";

export async function cmdDefault(): Promise<void> {
	const entry = await cmdSetup();
	await stopBalanceWorker({
		port: balanceWorkerPortFor(entry.worktreeNum),
		worktreeNum: entry.worktreeNum,
	});
	killOwnPorts(entry.worktreeNum);
	await startDev(entry);
}
