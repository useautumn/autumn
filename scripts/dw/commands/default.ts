import { cmdSetup } from "./setup.ts";
import { killOwnPorts } from "../helpers/ports.ts";
import { startDev } from "../helpers/start.ts";

export async function cmdDefault(): Promise<void> {
	const entry = await cmdSetup();
	killOwnPorts(entry.worktreeNum);
	await startDev(entry);
}
