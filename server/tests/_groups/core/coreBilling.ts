import type { TestGroup } from "../types";
import { coreAttach } from "./coreAttach";
import { coreBackSync } from "./coreBackSync";
import { coreBillingOthers } from "./coreBillingOthers";
import { coreLegacy } from "./coreLegacy";
import { coreLicensesBilling } from "./coreLicensesBilling";
import { coreLicensesCatalog } from "./coreLicensesCatalog";
import { coreMigrations } from "./coreMigrations";
import { coreMultiUpdate } from "./coreMultiUpdate";
import { corePlansCrud } from "./corePlansCrud";
import { coreStripe } from "./coreStripe";
import { coreUpdateSubscription } from "./coreUpdateSubscription";

export const coreBilling: TestGroup = {
	name: "core-billing",
	description:
		"Core billing and catalog tests: billing lifecycles, licenses, and plans CRUD",
	tier: "core",
	paths: [
		...coreAttach.paths,
		...coreUpdateSubscription.paths,
		...coreMultiUpdate.paths,
		...coreBillingOthers.paths,
		...coreLegacy.paths,
		...coreMigrations.paths,
		...coreStripe.paths,
		...coreBackSync.paths,
		...coreLicensesBilling.paths,
		...coreLicensesCatalog.paths,
		...corePlansCrud.paths,
	],
};
