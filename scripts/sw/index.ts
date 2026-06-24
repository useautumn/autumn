import { cmdInstall } from "./commands/install.ts";
import { cmdList } from "./commands/list.ts";
import { cmdPick } from "./commands/pick.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { fatal } from "./helpers/shell.ts";

const USAGE =
	"usage: sw <pick | install | list | teardown> (pick is what the herdr plugin runs)";

async function main(): Promise<void> {
	const sub = process.argv[2];
	switch (sub) {
		case "pick":
			await cmdPick();
			break;
		case "install":
			cmdInstall();
			break;
		case "list":
			cmdList();
			break;
		case "teardown":
			await cmdTeardown({ path: process.argv[3] });
			break;
		default:
			fatal(`unknown subcommand: ${sub ?? "(none)"}\n${USAGE}`);
	}
}

main();
