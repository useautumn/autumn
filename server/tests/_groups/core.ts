import { coreBalances } from "./core/coreBalances";
import { coreBilling } from "./core/coreBilling";
import { coreCatalog } from "./core/coreCatalog";
import type { TestGroup } from "./types";

export const core: TestGroup = {
	name: "core",
	description:
		"Critical flows that must pass: balances, billing, catalog, licenses, and plans CRUD",
	tier: "core",
	paths: [...coreBalances.paths, ...coreBilling.paths, ...coreCatalog.paths],
};
