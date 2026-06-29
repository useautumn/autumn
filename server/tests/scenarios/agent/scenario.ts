// Dispatches `bun scenario <ep | epv2 | mini | kp | email | email-v2 | email-mini | knowledge> [flags]` to the matching
// agent seed. Flags (--count, --concurrency, --attach-plan, --skip-clear,
// --keep-existing, --skip-stripe-reset) are read from process.argv by each seed and
// pass through.
import { runEmailMiniSeed } from "./email-mini.js";
import { runEmailPlatformSeed } from "./email-platform.js";
import { runEmailPlatformSeed as runEmailPlatformV2Seed } from "./email-platform-v2.js";
import { runKnowledgePlatformSeed } from "./knowledge-platform.js";

const scenarios = {
	email: runEmailPlatformSeed,
	"email-mini": runEmailMiniSeed,
	"email-v2": runEmailPlatformV2Seed,
	ep: runEmailPlatformSeed,
	epv2: runEmailPlatformV2Seed,
	knowledge: runKnowledgePlatformSeed,
	kp: runKnowledgePlatformSeed,
	mini: runEmailMiniSeed,
} as const;

type ScenarioKey = keyof typeof scenarios;

const isScenarioKey = (arg: string): arg is ScenarioKey => arg in scenarios;

const run = async () => {
	const key = process.argv.slice(2).find(isScenarioKey);
	if (!key) {
		console.error(
			"Usage: bun scenario <ep | epv2 | mini | kp | email | email-v2 | email-mini | knowledge> [--count N] [--concurrency N] [--attach-plan trial|enterprise] [--skip-clear] [--keep-existing] [--skip-stripe-reset]",
		);
		process.exit(1);
	}

	await scenarios[key]();
};

run()
	.catch((error) => {
		console.error("Scenario seed failed:", error);
		process.exit(1);
	})
	.finally(() => {
		process.exit(0);
	});
