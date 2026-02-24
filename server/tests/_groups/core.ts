import { coreAttach } from "./core/coreAttach";
import { coreBalances } from "./core/coreBalances";
import { coreLegacy } from "./core/coreLegacy";
import { coreMigrations } from "./core/coreMigrations";
import { coreMultiAttach } from "./core/coreMultiAttach";
import { coreStripe } from "./core/coreStripe";
import { coreUpdateSubscription } from "./core/coreUpdateSubscription";
import type { TestGroup } from "./types";

export const core: TestGroup = {
	name: "core",
	description:
		"Critical flows that must pass: balances, attach, update-subscription, legacy, migrations, stripe webhooks",
	tier: "core",
	paths: [
		...coreBalances.paths,
		...coreLegacy.paths,
		...coreMigrations.paths,
		...coreStripe.paths,
		...coreAttach.paths,
		...coreUpdateSubscription.paths,
		...coreMultiAttach.paths,
	],
};
