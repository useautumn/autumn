// Tests how the agent handles a feature list that mixes real and unavailable
// features. Three listed features exist on this org (priority queue, approval
// chains, compliance controls) but one does not (AI answer assistant), so the agent
// must apply the valid ones while recognizing the unavailable one rather than
// inventing a feature_id for it. Expectations are intentionally omitted for now.
import { withCustomers } from "../../fixtures/createSetup.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

const userPrompt = `attach the Scale plan to kp-customer-0100. On top of the plan they should also get:
- priority queue
- approval chains
- compliance controls
- AI answer assistant`;

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "nonexistent-features";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		meridian: customers.base({
			email: "billing@meridiandata.example",
			id: "kp-customer-0100",
			name: "Meridian Data",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.meridian,
			feature: features.workspaces,
			id: "kp-customer-0100-main",
			name: "Main",
		}),
	}),
});

initEval<EvalMetadata>({
	experimentName,
	setup,
	driver: createClaudeManagedLiveDriver(),
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	timeout: 150_000,
	cases: [
		{
			name: "handles a request for features not in the org catalog",
			conversation: [
				user({ message: userPrompt }),
				user({ message: "Go ahead with whatever you can." }),
				approve({ optional: true }),
			],
			expect: [],
		},
	],
});
