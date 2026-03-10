import type { TestGroup } from "../types";
import { coreAttach } from "./coreAttach";
import { coreBillingOthers } from "./coreBillingOthers";
import { coreLegacy } from "./coreLegacy";
import { coreMigrations } from "./coreMigrations";
import { coreStripe } from "./coreStripe";
import { coreUpdateSubscription } from "./coreUpdateSubscription";

export const coreBilling: TestGroup = {
	name: "core-billing",
	description:
		"Core billing tests: attach, update-subscription, multi-attach, setup-payment",
	tier: "core",
	paths: [
		...coreAttach.paths,
		...coreUpdateSubscription.paths,
		...coreBillingOthers.paths,
		...coreLegacy.paths,
		...coreMigrations.paths,
		...coreStripe.paths,
	],
};
