import { createSetup } from "../../fixtures/createSetup.js";
import { response } from "../../fixtures/expectations/index.js";
import {
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "plans";
	flow: "setup";
};

const experimentName = "setup-plans-email-platform";

const setup = createSetup({
	tag: "email-platform",
	features: () => ({}),
	plans: () => ({}),
	customers: () => ({}),
});

const pricingSpec = `I'm setting up pricing for an email API, roughly like Resend, and just want a good first pass in Autumn.

We have:
- Free: $0/mo, 3k transactional emails/mo, 100 emails/day cap, 1 domain, 5 AI credits
- Pro: starts at $20/mo for 50k emails, also have a $35/mo 100k tier, $0.90 per extra 1k emails, 10 domains, 100 AI credits
- Scale: starts at $90/mo for 100k emails and goes up for bigger volume; the main ones I care about are $350/mo for 500k, $650/mo for 1M, and $1,150/mo for 2.5M. Overage gets cheaper at higher volume, roughly $0.70, $0.65, then $0.46 per 1k.
- Marketing email is separate and priced by contacts instead of sends. Let's just start with $40/mo for 5k contacts, $250/mo for 50k, and $650/mo for 150k.
- Paid plans include 10k automation runs/mo, then $0.0015 per extra run. Free also includes 10k runs but should not have paid overage.
- Dedicated IP is a $30/mo add-on for Scale.
- Enterprise is custom.

Can you set up the core plans/features first? It doesn't have to capture every tiny tier yet.`;

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "plans",
		flow: "setup",
	},
	timeout: 120_000,
	cases: [
		{
			name: "models a multi-product email platform pricing page",
			conversation: [user({ message: pricingSpec })],
			expect: [response.mentions({ phrases: ["plan"] })],
		},
	],
});
