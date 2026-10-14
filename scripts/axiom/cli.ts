import "dotenv/config";
import { createAtomDataset } from "./createAtomDataset.js";
import { createLeafDataset } from "./createLeafDataset.js";

const actions = {
	"create-atom": createAtomDataset,
	"create-leaf": createLeafDataset,
} satisfies Record<string, () => Promise<void>>;

type Action = keyof typeof actions;

const isAction = (value: string | undefined): value is Action =>
	value !== undefined && Object.hasOwn(actions, value);

const usage = () =>
	[
		"Usage: bun axiom <action>   (or bun axiom:staging / bun axiom:prod <action>)",
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
