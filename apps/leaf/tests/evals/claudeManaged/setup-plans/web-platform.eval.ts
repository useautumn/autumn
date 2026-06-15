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

const experimentName = "setup-plans-web-platform";

// Empty catalog — the agent should set up the pricing from scratch.
const setup = createSetup({
	tag: "web-platform",
	features: () => ({}),
	plans: () => ({}),
	customers: () => ({}),
});

// Pricing spec adapted from https://exa.ai/pricing — the real pricing page
// (per-endpoint usage pricing with per-result overage, per-page add-ons, and a
// separate agent-run model with usage components vs fixed effort modes). Kept
// messy on purpose (price ranges in the cards vs a precise table) to test the
// agent's ability to model and clarify a real-world pricing page.
const pricingSpec = `I want to set up pricing for our web search API platform in Autumn. Here's our full pricing page — help me model it:

# Pricing

## Use cases
Coding agents, chatbots, news monitoring, enrichments, voice agents, people search, company search.

## Plans (pay as you go)

### Free Tier — Free / 1k requests per month
Run up to 20,000 requests per month for free.

### Search — $7 / 1k requests
Real-time search data with token-efficient page contents.

### Deep Search — / 1k requests
Research with structured outputs optimized for complex queries.
- Deep Search: $12 / 1k requests
- Deep-Reasoning Search: $15 / 1k requests

### Agent — $0.025–$2.00 / run
Async agents for deep research, list building, and enrichment.

By default Agent uses effort: auto — compute and tool usage scale to the task. Usage components:
- Agent Compute Units: $0.10 / ACU
- Search tool calls: $0.005 / search
- Email contact enrichment: $0.02 / email
- Phone contact enrichment: $0.07 / phone number
Or pick a fixed effort mode for predictable per-request pricing:
- Low: $0.025 / request
- Medium: $0.10 / request
- High: $0.50 / request
- X-high: $1.00 / request
Contact enrichment (emails and phone numbers) is billed separately.

### Contents — $1 / 1k pages per content type
Full page web contents, with highlights optimized for AI.


### Monitors — $15 / 1k requests
Track new events and updates across the web.


## Additional costs (all endpoints)
- +$1 per 1,000 requests for each additional result above 10 (Search, Deep Search, Deep-Reasoning Search, Monitors; not Contents)
- AI page summaries: $1 per 1,000 pages

## Enterprise
- Custom pricing for high volume, custom datasets, dedicated support`;

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
			name: "models a usage-based web search pricing page",
			conversation: [user({ message: pricingSpec })],
			expect: [response.mentions({ phrases: ["plan"] })],
		},
	],
});
