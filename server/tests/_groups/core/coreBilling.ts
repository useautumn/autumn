import type { TestGroup } from "../types";
import { coreAttach } from "./coreAttach";
import { coreBillingOthers } from "./coreBillingOthers";
import { coreLegacy } from "./coreLegacy";
import { coreMigrations } from "./coreMigrations";
import { coreMultiUpdate } from "./coreMultiUpdate";
import { coreStripe } from "./coreStripe";
import { coreUpdateSubscription } from "./coreUpdateSubscription";

export const coreBilling: TestGroup = {
	name: "core-billing",
	description:
		"Core billing tests: attach, update-subscription, multi-attach, multi-update, setup-payment",
	tier: "core",
	paths: [
		...coreAttach.paths,
		...coreUpdateSubscription.paths,
		...coreMultiUpdate.paths,
		...coreBillingOthers.paths,
		...coreLegacy.paths,
		...coreMigrations.paths,
		...coreStripe.paths,
	],
};
