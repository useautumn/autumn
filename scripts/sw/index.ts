import { cmdList } from "./commands/list.ts";
import { cmdPick } from "./commands/pick.ts";
import { cmdTeardown } from "./commands/teardown.ts";
import { fatal } from "./helpers/shell.ts";

const USAGE = "usage: bun sw [list | teardown]  (no args = pick local/exe.dev)";

async function main(): Promise<void> {
	const sub = process.argv[2];
	switch (sub) {
		case undefined:
		case "pick":
			await cmdPick();
			break;
		case "list":
			cmdList();
			break;
		case "teardown":
			await cmdTeardown({ path: process.argv[3] });
			break;
		default:
			fatal(`unknown subcommand: ${sub}\n${USAGE}`);
	}
}

main();
