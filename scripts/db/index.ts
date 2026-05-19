import { cmdHelp } from "./commands/help.ts";
import { cmdGenerate } from "./commands/generate.ts";
import { cmdMigrate } from "./commands/migrate.ts";
import { cmdMarkApplied } from "./commands/markApplied.ts";
import { cmdRebase } from "./commands/rebase.ts";
import { parseEnv } from "./helpers/env.ts";

async function main(): Promise<void> {
	const sub = process.argv[2];
	const rest = process.argv.slice(3);

	if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
		cmdHelp();
		return;
	}

	switch (sub) {
		case "generate":
			await cmdGenerate();
			return;
		case "migrate":
			await cmdMigrate(parseEnv(rest), {
				dryRun: false,
				bootstrap: rest.includes("--bootstrap"),
			});
			return;
		case "migrate:dry":
			await cmdMigrate(parseEnv(rest), {
				dryRun: true,
				bootstrap: rest.includes("--bootstrap"),
			});
			return;
		case "mark-applied":
			await cmdMarkApplied(parseEnv(rest));
			return;
		case "rebase":
			await cmdRebase();
			return;
		default:
			console.error(`unknown subcommand: ${sub}`);
			cmdHelp();
			process.exit(2);
	}
}

await main();
