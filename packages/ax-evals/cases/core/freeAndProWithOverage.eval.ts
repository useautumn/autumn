import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
/**
 * Persona: AI writing assistant. Archetype: usage overage on included
 * allowance. The prompt is deliberately COMPLETE — the agent must write the
 * config without asking anything.
 */
export const writingAssistant = defineCase({
	name: "free-and-pro-with-overage",
	prompt: [
		"I run an AI writing assistant and want to set up my pricing in autumn.config.ts.",
		"Two plans. Free: no charge, 50 AI messages per month.",
		"Pro: $20/month, 1,000 AI messages included per month, then $0.01 per extra message billed monthly based on usage.",
		"All details are final — please write the autumn.config.ts file now, without asking me anything.",
	].join(" "),
	expect: [
		config.valid(),
		config.planCount(2),
		config.plan("free tier", {
			freePlan: true,
			items: [{ included: 50, reset: { interval: "month" } }],
		}),
		config.plan("pro with overage", {
			price: { amount: 20, interval: "month" },
			items: [
				{
					included: 1000,
					price: {
						amount: 0.01,
						interval: "month",
						billing_method: "usage_based",
					},
				},
			],
		}),
		conduct.skillFired(),
		conduct.completed(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const aiMessages = feature({
	id: "ai_messages",
	name: "AI Messages",
	type: "metered",
	consumable: true,
});

export const free = plan({
	id: "free",
	name: "Free",
	items: [
		item({
			featureId: aiMessages.id,
			included: 50,
			reset: { interval: "month" },
		}),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		item({
			featureId: aiMessages.id,
			included: 1000,
			reset: { interval: "month" },
			price: {
				amount: 0.01,
				interval: "month",
				billingMethod: "usage_based",
			},
		}),
	],
});
`,
});

initAxEval({ axCase: writingAssistant, maxTurns: 10, timeoutMs: 240_000 });
