import {
	cmdCapy,
	cmdCapyLogs,
	cmdCapyRestart,
	cmdCapyStatus,
	cmdCapyStop,
} from "./command.ts";

async function main(): Promise<void> {
	const sub = process.argv[2];
	if (!sub || sub.startsWith("--")) {
		await cmdCapy();
		return;
	}
	switch (sub) {
		case "status":
			cmdCapyStatus();
			break;
		case "logs":
			cmdCapyLogs();
			break;
		case "stop":
			cmdCapyStop();
			break;
		case "restart":
			await cmdCapyRestart();
			break;
		default:
			throw new Error(`unknown capy subcommand: ${sub}`);
	}
}

await main();
