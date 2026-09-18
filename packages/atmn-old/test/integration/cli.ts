import { atmnScenarios, isAtmnScenarioKey } from "./scenarios/registry.js";
import {
	prepareAtmnScenario,
	resetAtmnScenario,
	runAtmnCli,
	runAtmnScratchCli,
} from "./utils/atmnTestWorkspace.js";

type AtmnTestAction = "env" | "pull" | "push" | "reset" | "seed";

const actions = new Set<AtmnTestAction>([
	"env",
	"pull",
	"push",
	"reset",
	"seed",
]);

const usage = () => {
	console.log(`Usage:
  bun atmn-test list
  bun atmn-test seed <scenario>
  bun atmn-test seed <scenario> --skip-clear
  bun atmn-test reset <scenario>
  bun atmn-test pull [...atmn args]
  bun atmn-test push [...atmn args]
  bun atmn-test push <scenario> [...atmn args]
  bun atmn-test pull <scenario> [...atmn args]
  bun atmn-test env <scenario>
  bun atmn-test <scenario> seed|pull|push|env|reset [...atmn args]

Examples:
  bun atmn-test pull --force --no-declaration-file
  bun atmn-test push
  bun atmn-test basic-plan seed
  bun atmn-test basic-plan pull --force --no-declaration-file
  bun atmn-test basic-plan push
  bun atmn-test basic-plan push --yes`);
};

const listScenarios = () => {
	for (const scenario of Object.values(atmnScenarios)) {
		console.log(`${scenario.key} - ${scenario.description}`);
	}
};

const resolveCommand = () => {
	const [first, second, ...rest] = process.argv.slice(2);

	if (!first || first === "help" || first === "--help" || first === "-h") {
		return { action: "help" as const };
	}

	if (first === "list") {
		return { action: "list" as const };
	}

	if (isAtmnScenarioKey(first)) {
		if (!second) {
			return {
				action: "seed" as const,
				args: [],
				scenarioKey: first,
			};
		}

		if (!actions.has(second as AtmnTestAction)) {
			return { action: "unknown" as const, value: `${first} ${second}` };
		}

		return {
			action: second as AtmnTestAction,
			args: rest,
			scenarioKey: first,
		};
	}

	if (actions.has(first as AtmnTestAction)) {
		const action = first as AtmnTestAction;
		if ((action === "pull" || action === "push") && !isAtmnScenarioKey(second)) {
			return {
				action,
				args: second ? [second, ...rest] : rest,
				scenarioKey: undefined,
			};
		}

		return {
			action,
			args: rest,
			scenarioKey: second,
		};
	}

	return { action: "unknown" as const, value: first };
};

const getScenario = (scenarioKey?: string) => {
	if (!scenarioKey || !isAtmnScenarioKey(scenarioKey)) {
		throw new Error(
			`Unknown atmn test scenario "${scenarioKey ?? ""}". Run: bun atmn-test list`,
		);
	}

	return atmnScenarios[scenarioKey];
};

const run = async () => {
	const command = resolveCommand();

	if (command.action === "help") {
		usage();
		return;
	}

	if (command.action === "list") {
		listScenarios();
		return;
	}

	if (command.action === "unknown") {
		throw new Error(`Unknown atmn-test command or scenario "${command.value}"`);
	}

	const scenario = command.scenarioKey
		? getScenario(command.scenarioKey)
		: undefined;

	if (command.action === "seed") {
		if (!scenario) {
			throw new Error("seed requires a scenario. Example: bun atmn-test seed basic-plan");
		}
		const prepared = await prepareAtmnScenario({
			scenario,
		});
		console.log(`Seeded ${scenario.key}`);
		console.log(`Workspace: ${prepared.workspaceDir}`);
		console.log(`Config after pull: ${prepared.configPath}`);
		console.log(`Pull: bun atmn-test pull ${scenario.key}`);
		console.log(`Push after editing config: bun atmn-test push ${scenario.key}`);
		return;
	}

	if (command.action === "reset") {
		if (!scenario) {
			throw new Error("reset requires a scenario. Example: bun atmn-test reset basic-plan");
		}
		await resetAtmnScenario({ scenario });
		console.log(`Reset ${scenario.key}`);
		return;
	}

	if (command.action === "env") {
		if (!scenario) {
			throw new Error("env requires a scenario. Example: bun atmn-test env basic-plan");
		}
		await runAtmnCli({
			command: "env",
			scenario,
			args: command.args,
		});
		return;
	}

	if (!scenario) {
		await runAtmnScratchCli({
			command: command.action,
			args: command.args,
		});
		return;
	}

	await runAtmnCli({
		command: command.action,
		scenario,
		args: command.args,
	});
};

run()
	.then(() => {
		process.exit(0);
	})
	.catch((error) => {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		if (
			message.startsWith("Unknown atmn-test command") ||
			message.startsWith("Unknown atmn test scenario")
		) {
			usage();
		}
		process.exit(1);
	});
