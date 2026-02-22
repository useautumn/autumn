import type { TestGroup } from "../types";

export const coreLegacy: TestGroup = {
	name: "core-legacy",
	description: "Core legacy (v1) attach tests",
	tier: "core",
	paths: [
		"legacy/attach/attach-misc.test.ts",
		"legacy/attach/attach-new-billing-subscription.test.ts",
		"legacy/attach/attach-response.test.ts",
		"legacy/attach/addon/legacy-addon.test.ts",
		"legacy/attach/checkout/legacy-checkout-basic.test.ts",
		"legacy/attach/downgrade/legacy-downgrade.test.ts",
		"legacy/attach/entities/legacy-entities-basic.test.ts",
		"legacy/attach/invoice/legacy-attach-invoice-mode.test.ts",
		"legacy/attach/invoice/payment-failure/legacy-attach-payment-failed.test.ts",
		"legacy/attach/new/legacy-new-merged.test.ts",
		"legacy/attach/new/legacy-new-oneoff.test.ts",
		"legacy/attach/trial/legacy-trial.test.ts",
		"legacy/attach/update-quantity/legacy-update-quantity.test.ts",
		"legacy/attach/upgrade/legacy-upgrade.test.ts",
		"legacy/attach/upgrade/legacy-upgrade-usage.test.ts",
		"legacy/attach/upgrade/legacy-upgrade-prepaid.test.ts",
		"legacy/attach/upgrade/legacy-upgrade-merged.test.ts",
	],
};
