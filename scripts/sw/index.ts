import { cmdInstall } from "./commands/install.ts";
import { cmdList } from "./commands/list.ts";
import { cmdPick } from "./commands/pick.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { cmdUninstall } from "./commands/uninstall.ts";
import { fatal } from "./helpers/shell.ts";

const USAGE =
	"usage: bun sw [install | uninstall | list | teardown]  (no args = pick local/exe.dev)";

async function main(): Promise<void> {
	const sub = process.argv[2];
	switch (sub) {
		case undefined:
		case "pick":
			await cmdPick();
			break;
		case "install":
			cmdInstall();
			break;
		case "uninstall":
			cmdUninstall();
			break;
		case "list":
			cmdList();
			break;
		case "teardown": {
			const arg = process.argv[3];
			await cmdTeardown({
				path: arg && !arg.startsWith("--") ? arg : undefined,
				orphans: process.argv.includes("--orphans"),
			});
			break;
		}
		default:
			fatal(`unknown subcommand: ${sub}\n${USAGE}`);
	}
}

main();
