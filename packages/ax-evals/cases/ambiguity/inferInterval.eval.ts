import { defineCase } from "../../src/cases/defineCase.ts";
import { conduct } from "../../src/grading/expectations/conductExpectations.ts";
import { config } from "../../src/grading/expectations/configExpectations.ts";
import { initAxEval } from "../../src/initAxEval.ts";
/**
 * VAGUE/should-infer: the reset interval is omitted, but monthly is the one
 * defensible default for a monthly-priced plan — asking here is over-asking.
 * Passing = infer monthly and proceed without questions.
 */
export const inferInterval = defineCase({
	name: "infer-interval",
	prompt:
		"Set up autumn.config.ts for us: one Pro plan, $20 a month, comes with 1,000 messages.",
	expect: [
		conduct.mustWriteImmediately(),
		config.valid(),
		config.planCount(1),
		config.plan("pro with monthly messages", {
			price: { amount: 20, interval: "month" },
			items: [{ included: 1000, reset: { interval: "month" } }],
		}),
		conduct.skillFired(),
		conduct.completed(),
	],
	goldenConfig: `import { feature, plan, item } from "atmn";

export const messages = feature({
	id: "messages",
	name: "Messages",
	type: "metered",
	consumable: true,
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: { amount: 20, interval: "month" },
	items: [
		item({
			featureId: messages.id,
			included: 1000,
			reset: { interval: "month" },
		}),
	],
});
`,
});

initAxEval({ axCase: inferInterval, maxTurns: 10, timeoutMs: 240_000 });
