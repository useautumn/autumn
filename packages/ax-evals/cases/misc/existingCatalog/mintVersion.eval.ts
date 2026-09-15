import { defineCase } from "../../../src/cases/defineCase.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../../src/grading/expectations/configExpectations.ts";
import { org } from "../../../src/grading/expectations/orgExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";
import {
	existingCatalogPrimer,
	mintGoldenConfig,
	proV1Config,
} from "./proSetup.ts";

/**
 * Existing catalog, new version: Pro is live with a paying subscriber, and the price
 * goes up for new customers only. Passing = the config holds two rows of pro
 * (a new active version at $25 and v1 kept at $20), the org holds both after
 * the push, and the change went out through atmn. The failures this catches:
 * editing v1 in place (repricing the existing customer), or rewriting the
 * plan from scratch so the org gets a delete + create instead of a version.
 */
export const mintVersion = defineCase({
	name: "existing-catalog-new-version",
	prompt: [
		"heads up: pro's going up to $25/mo. anyone already on pro keeps paying $20 though.",
		"push it once it's done, no need to check with me",
	].join(" "),
	scenario: {
		primer: existingCatalogPrimer("The org has paying customers on pro."),
		seedCatalog: proV1Config,
		withStripe: true,
		seedCustomers: [
			{
				customer: {
					id: "cus_on_pro",
					name: "Ada Lovelace",
					email: "ada@example.com",
				},
				paymentMethod: true,
				attach: [{ plan_id: "pro" }],
			},
		],
	},
	expect: [
		...catalog({
			plans: {
				"pro active at $25": {
					price: { amount: 25, interval: "month" },
					items: [{ included: 500, reset: { interval: "month" } }],
				},
			},
		}),
		config.historyVersion("pro v1 kept at $20", {
			price: { amount: 20, interval: "month" },
		}),
		config.versionsOf({ planId: "pro", count: 2 }),
		org.activePlan("pro live at $25", {
			id: "pro",
			price: { amount: 25, interval: "month" },
		}),
		org.planVersions({ planId: "pro", count: 2 }),
		conduct.appliedViaAtmn(),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: mintGoldenConfig,
});

initAxEval({ axCase: mintVersion, maxTurns: 24, timeoutMs: 480_000 });
