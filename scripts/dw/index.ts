import { cmdAdmin } from "./commands/admin.ts";
import { cmdAttach } from "./commands/attach.ts";
import { cmdCleanup } from "./commands/cleanup.ts";
import { cmdDefault } from "./commands/default.ts";
import { cmdDisable } from "./commands/disable.ts";
import { cmdEnable } from "./commands/enable.ts";
import { cmdIdentify } from "./commands/identify.ts";
import { cmdList } from "./commands/list.ts";
import { cmdLogs } from "./commands/logs.ts";
import { cmdReset } from "./commands/reset.ts";
import { cmdRun } from "./commands/run.ts";
import { cmdSetup } from "./commands/setup.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { fatal } from "./helpers/shell.ts";

async function main(): Promise<void> {
	const sub = process.argv[2];
	if (!sub || sub.startsWith("--")) {
		await cmdDefault();
		return;
	}
	switch (sub) {
		case "setup":
			await cmdSetup();
			break;
		case "run":
			await cmdRun();
			break;
		case "teardown":
			await cmdTeardown({ all: process.argv.includes("--all") });
			break;
		case "list":
			cmdList();
			break;
		case "cleanup":
			cmdCleanup({ dryRun: process.argv.includes("--dry-run") });
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
		case "identify":
			cmdIdentify();
			break;
		case "enable":
			cmdEnable();
			break;
		case "disable":
			cmdDisable();
			break;
		case "admin":
			cmdAdmin();
			break;
		default:
			fatal(
				`unknown subcommand: ${sub} (use: setup | run | teardown | cleanup | list | reset | logs | attach | identify | enable | disable | admin)`,
			);
	}
}

await main();
