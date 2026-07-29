import { coreBalances } from "./core/coreBalances";
import { coreBilling } from "./core/coreBilling";
import type { TestGroup } from "./types";

export const core: TestGroup = {
	name: "core",
	description:
		"Critical flows that must pass: balances, billing, licenses, and plans CRUD",
	tier: "core",
	paths: [...coreBalances.paths, ...coreBilling.paths],
};
