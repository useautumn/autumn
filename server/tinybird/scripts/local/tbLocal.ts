import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildProject } from "./build/buildProject.js";
import { resolveTarget } from "./lib/tinybirdTarget.js";
import { resetEvents } from "./reset/resetEvents.js";
import { runSeed } from "./seed/runSeed.js";
import { parseSeedOptions, SEED_OPTION_FLAGS } from "./seed/seedOptions.js";
import { verifyRollups } from "./seed/verifyRollups.js";

const USAGE = `Usage: bun tinybird/scripts/local/tbLocal.ts <build|seed|verify|reset> [flags]

Target (all commands):
  --url <url>          Tinybird API URL (env TB_LOCAL_URL, default http://localhost:7181)
  --token <token>      Workspace token (env TB_LOCAL_TOKEN). Omit on Local to resolve it from /tokens.
  --workspace <name>   Local workspace to build into / resolve (env TB_LOCAL_WORKSPACE, default dev)

See tinybird/scripts/local/README.md for seed flags and presets.`;

const SERVER_DIR = resolve(import.meta.dir, "../../..");

const main = async () => {
	const { values, positionals } = parseArgs({
		args: Bun.argv.slice(2),
		allowPositionals: true,
		options: {
			url: { type: "string" },
			token: { type: "string" },
			workspace: { type: "string" },
			help: { type: "boolean", short: "h" },
			...SEED_OPTION_FLAGS,
		},
	});
	const command = positionals[0];
	if (values.help || !command) {
		console.log(USAGE);
		return;
	}

	const seedOptions = parseSeedOptions({ values });
	if (command === "seed" && seedOptions.dryRun) {
		await runSeed({ target: null, options: seedOptions });
		return;
	}

	const target = await resolveTarget({
		url: values.url,
		token: values.token,
		workspace: values.workspace,
	});
	console.error(
		`target ${target.url}${target.workspace ? ` (workspace ${target.workspace})` : ""}`,
	);

	switch (command) {
		case "build": {
			const started = Date.now();
			await buildProject({ target, serverDir: SERVER_DIR });
			console.log(`build ok in ${((Date.now() - started) / 1000).toFixed(1)}s`);
			return;
		}
		case "seed": {
			const ok = await runSeed({
				target,
				options: parseSeedOptions({ values }),
			});
			if (!ok) process.exit(1);
			return;
		}
		case "verify": {
			const options = parseSeedOptions({ values });
			const ok = await verifyRollups({
				target,
				orgId: options.orgId,
				env: options.env,
			});
			if (!ok) process.exit(1);
			return;
		}
		case "reset": {
			await resetEvents({ target });
			return;
		}
		default:
			console.log(USAGE);
			process.exit(1);
	}
};

await main();
