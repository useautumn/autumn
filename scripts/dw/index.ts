import { fatal } from "./helpers/shell.ts";
import { cmdDefault } from "./commands/default.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { cmdList } from "./commands/list.ts";
import { cmdReset } from "./commands/reset.ts";
import { cmdLogs } from "./commands/logs.ts";
import { cmdAttach } from "./commands/attach.ts";

async function main(): Promise<void> {
	const sub = process.argv[2];
	if (!sub || sub.startsWith("--")) {
		await cmdDefault();
		return;
	}
	switch (sub) {
		case "teardown":
			await cmdTeardown({ all: process.argv.includes("--all") });
			break;
		case "list":
			cmdList();
			break;
		case "reset":
			await cmdReset();
			break;
		case "logs":
			cmdLogs();
			break;
		case "attach":
			cmdAttach();
			break;
		default:
			fatal(
				`unknown subcommand: ${sub} (use: teardown | list | reset | logs | attach)`,
			);
	}
}

await main();
