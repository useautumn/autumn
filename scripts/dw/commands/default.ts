import { killOwnPorts } from "../helpers/ports.ts";
import { startDev } from "../helpers/start.ts";
import { cmdSetup } from "./setup.ts";

export async function cmdDefault(): Promise<void> {
	const entry = await cmdSetup();
	killOwnPorts(entry.worktreeNum);
	startDev(entry);
}
