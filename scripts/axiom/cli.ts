/**
 * Axiom provisioning CLI. Secrets (AXIOM_ADMIN_TOKEN) are injected by infisical
 * via the package.json scripts:
 *
 *   bun axiom <action>          # dev   (infisical --env=dev)
 *   bun axiom:prod <action>     # prod  (infisical --env=prod)
 *
 * Add a new action by registering it in the `actions` map below.
 */
import "dotenv/config";
import { createLeafDataset } from "./createLeafDataset.js";

const actions = {
	"create-leaf": createLeafDataset,
} satisfies Record<string, () => Promise<void>>;

type Action = keyof typeof actions;

const isAction = (value: string | undefined): value is Action =>
	value !== undefined && Object.hasOwn(actions, value);

const usage = () =>
	[
		"Usage: bun axiom <action>   (or bun axiom:prod <action>)",
		"",
		"Actions:",
		...Object.keys(actions).map((action) => `  - ${action}`),
	].join("\n");

const main = async () => {
	const action = process.argv[2];
	if (!isAction(action)) {
		console.error(usage());
		process.exit(1);
	}

	try {
		await actions[action]();
	} catch (error) {
		console.error(error instanceof Error ? error.message : error);
		process.exit(1);
	}
};

await main();
