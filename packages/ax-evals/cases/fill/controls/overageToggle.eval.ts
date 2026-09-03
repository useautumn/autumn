import { defineCase } from "../../../src/cases/defineCase.ts";
import { stepScenario } from "../../../src/cases/stepScenario.ts";
import { catalog } from "../../../src/grading/expectations/catalogExpectations.ts";
import { conduct } from "../../../src/grading/expectations/conductExpectations.ts";
import { initAxEval } from "../../../src/initAxEval.ts";

/**
 * FILL / controls, overage-off default with free buffer: the plan HAS a
 * priced overage item, but billing for it defaults OFF — instead customers
 * get a 20% unbilled buffer, then stop. Passing = a spend_limits entry with
 * skip_overage_billing + usage_percentage 20. The trap is the percentage
 * base: "20% buffer" is overage_limit 20 (overage relative to allowance),
 * never 120 — the grader pins the exact number.
 */
export const overageToggle = defineCase({
	name: "fill-controls-overage-toggle",
	prompt: [
		"hey, one pro plan: $25 a month with 50,000 emails a month, then $0.80 per 1,000 extra, billed end of month.",
		"but by default customers should NOT get billed for extras — out of the box they get a free buffer of 20% over their limit, then it stops.",
		"they can flip overage billing on themselves later in our settings page — that part's runtime, just set the plan default up.",
		"that's everything — go ahead, no need to ask me anything",
	].join(" "),
	scenario: stepScenario(),
	expect: [
		conduct.mustWriteImmediately(),
		...catalog({
			features: {
				"emails (metered)": { type: "metered", granted: true },
			},
			plans: {
				"pro with overage item and default-off billing + 20% buffer": {
					price: { amount: 25, interval: "month" },
					items: [
						{
							included: 50000,
							price: {
								amount: 0.8,
								billing_units: 1000,
								billing_method: "usage_based",
							},
						},
					],
					billing_controls: {
						spend_limits: [
							{
								enabled: true,
								skip_overage_billing: true,
								limit_type: "usage_percentage",
								overage_limit: 20,
							},
						],
					},
				},
			},
		}),
		conduct.skillFired(),
		conduct.completed(),
		conduct.noHarnessFriction(),
		conduct.noUnapprovedPush(),
	],
	goldenConfig: `import { billingControls, feature, plan, item } from "atmn";

export const emails = feature({
	id: "emails",
	name: "Emails",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 25, interval: "month" },
	items: [
		item({
			featureId: emails.id,
			included: 50000,
			reset: { interval: "month" },
			price: {
				amount: 0.8,
				billingUnits: 1000,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
	],
	billingControls: billingControls({
		spend_limits: [
			{
				feature_id: "emails",
				enabled: true,
				skip_overage_billing: true,
				limit_type: "usage_percentage",
				overage_limit: 20,
			},
		],
	}),
});
`,
});

initAxEval({ axCase: overageToggle, maxTurns: 24, timeoutMs: 480_000 });
