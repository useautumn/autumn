// "1k/yr on the scale plan, then bumped to 2k/yr with unlimited seats" carries two
// load-bearing ambiguities the agent must resolve before acting:
// 1. A bare "Nk/yr" (no $, no unit) could be a base price or a credit quantity.
// 2. "scale" maps to two sibling plans, scale (monthly) and scale_yearly.
// The agent must ask both before any preview/write, not guess and attach scale
// with a custom annual price.
import { withCustomers } from "../../fixtures/createSetup.js";
import { api, response } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "schedule";
};

const experimentName = "ambiguous-yearly-amount";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		aperture: customers.base({
			email: "billing@aperture.example",
			id: "kp-customer-0042",
			name: "Aperture Collective",
		}),
	}),
});

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "schedule",
	},
	timeout: 120_000,
	cases: [
		{
			name: "clarifies amount-vs-quantity and plan variant before previewing",
			conversation: [
				user({
					message:
						"Provision kp-customer-0042 — 1k/yr on the scale plan, then a year later bumped up to 2k/yr with unlimited seats.",
				}),
			],
			expect: [
				// Bare "Nk/yr" must be disambiguated: base price vs credit quantity.
				response.asked({ phrases: ["base price", "credit"] }),
				// "scale" has a yearly sibling; the agent must ask which variant.
				response.asked({ phrases: ["scale yearly"] }),
				// No billing action until both ambiguities are resolved.
				api.calledTimes({ call: { toolName: "previewAttach" }, count: 0 }),
				api.calledTimes({ call: { toolName: "attach" }, count: 0 }),
				api.calledTimes({
					call: { toolName: "previewCreateSchedule" },
					count: 0,
				}),
				api.calledTimes({ call: { toolName: "createSchedule" }, count: 0 }),
			],
		},
	],
});
