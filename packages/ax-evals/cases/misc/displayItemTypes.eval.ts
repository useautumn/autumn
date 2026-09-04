import { defineCase } from "../../src/cases/defineCase.ts";
import { stepScenario } from "../../src/cases/stepScenario.ts";
import { catalog } from "../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { judge } from "../../src/grading/expectations/judgeExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";

/**
 * DISPLAY: a catalog rich enough to exercise most item-line shapes from the
 * skill's "Showing the catalog" grammar — plain allowance, allowance+overage,
 * included+per-unit seats, unlimited, boolean, one-off prepaid add-on, and an
 * annual variant. Graded mostly by judge: did the proposal and the final
 * message use the plain-text catalog format, correctly phrased?
 */
export const displayItemTypes = defineCase({
	name: "misc-display-item-types",
	prompt: [
		"hey, setting up billing. free plan comes with 100 AI messages a month.",
		"pro is $20 a month or $200 a year — 500 messages a month, then $0.01 per message over.",
		"pro includes 3 seats, extra seats are $10 each per month.",
		"unlimited projects on pro, and pro gets SSO.",
		"there's also a message pack: $10 for 1,000 extra messages, buy anytime.",
		"annual pro still resets messages monthly. that's everything.",
	].join(" "),
	scenario: stepScenario(),
	simulatedUser: {
		goal: "Get your free/pro plans and the message pack set up in Autumn. You gave all the details up front — confirm proposals that match them.",
		facts: [
			"- Free: 100 AI messages a month.",
			"- Pro: $20/month or $200/year; 500 messages a month then $0.01 per extra message; 3 seats included then $10 per extra seat per month; unlimited projects; SSO.",
			"- Message pack (buy anytime, alongside a plan): $10 for 1,000 extra messages.",
			"- Annual pro still resets messages monthly. No trials.",
		].join("\n"),
	},
	expect: [
		...judge.conversation({
			"showed structure in plain words":
				"Before writing any config, did the agent show the proposed structure (plans, what's in them) in plain words — not as code and not as a markdown table?",
			"used the catalog format":
				"When showing the full catalog with numbers, did the agent use plain text — a 'Features:' line listing each feature with its kind in parentheses, then each plan as a heading with one line per item underneath — rather than a markdown table?",
			"item lines phrased correctly":
				"In the catalog display, was overage phrased like '500 AI messages per month, then $0.01 per message', seats like '3 seats included, then $10 per seat', projects as 'Unlimited projects', and SSO by name alone (not 'SSO enabled')?",
			"annual variant shown inline":
				"Was the annual price shown inline with pro (e.g. 'or $200/year — messages still reset monthly') rather than as a separate unrelated plan?",
			"proposal listed assumptions":
				"Did the catalog proposal end with a list of assumptions the agent made?",
			"final shown after validation":
				"After writing and validating the config, did the agent show the final catalog again in the same plain-text format?",
		}),
		...catalog({
			features: {
				"messages (metered)": { type: "metered", granted: true },
				"sso (boolean)": { type: "boolean", granted: true },
			},
			exactPlans: false,
			plans: {
				"free 100 messages": {
					freePlan: true,
					items: [{ included: 100, reset: { interval: "month" } }],
				},
				"pro with overage": {
					price: { amount: 20, interval: "month" },
					items: [
						{
							included: 500,
							reset: { interval: "month" },
							price: { amount: 0.01, billing_method: "usage_based" },
						},
					],
				},
				"message pack add-on": {
					add_on: true,
					items: [{ price: { billing_method: "prepaid" } }],
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const seats = feature({
	id: "seats",
	name: "Seats",
	type: "metered",
	consumable: false,
});

export const projects = feature({
	id: "projects",
	name: "Projects",
	type: "metered",
	consumable: false,
});

export const sso = feature({
	id: "sso",
	name: "SSO",
	type: "boolean",
});

export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({ featureId: messages.id, included: 100, reset: { interval: "month" } }),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 500,
			reset: { interval: "month" },
			price: {
				amount: 0.01,
				interval: "month",
				billingMethod: "usage_based",
				billingUnits: 1,
			},
		}),
		item({
			featureId: seats.id,
			included: 3,
			price: {
				amount: 10,
				interval: "month",
				billingMethod: "usage_based",
				billingUnits: 1,
			},
		}),
		item({ featureId: projects.id, unlimited: true }),
		item({ featureId: sso.id }),
	],
});

export const proAnnual = pro.variant({
	id: "pro_annual",
	name: "Pro Annual",
	customize: {
		price: { amount: 200, interval: "year" },
	},
});

export const messagePack = plan({
	id: "message_pack",
	name: "Message Pack",
	addOn: true,
	items: [
		item({
			featureId: messages.id,
			included: 0,
			price: {
				amount: 10,
				interval: "one_off",
				billingMethod: "prepaid",
				billingUnits: 1000,
			},
		}),
	],
});
`,
});

initAxEval({ axCase: displayItemTypes, maxTurns: 32, timeoutMs: 480_000 });
