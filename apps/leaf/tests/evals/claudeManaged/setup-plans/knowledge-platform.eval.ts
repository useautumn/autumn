import { response } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "plans";
	flow: "setup";
};

const experimentName = "setup-plans-knowledge-platform";

const setup = orgSetups.knowledgePlatform();

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
			name: "asks for pricing details before creating knowledge platform plans",
			conversation: [
				user({
					message:
						"I'm trying to set up pricing for our knowledge platform. We have multiple subscription tiers, each with a different base price and access to different features, but they should all use the same AI credit setup: included credits, prepaid credit packs, and overage. How should I set this up?",
				}),
			],
			expect: [
				response.askedBeforeTool({
					phrases: [
						"plan",
						"base price",
						"features",
						"included credits",
						"prepaid",
						"overage",
					],
					notPhrases: ["created", "done"],
					toolName: "createPlan",
				}),
			],
		},
	],
});
