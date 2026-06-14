// Tests the agent's ability to diff a requested boolean-feature list against what
// the Scale plan already grants. Scale already includes priority_queue, approval_chains,
// and compliance_controls, so those must be no-ops — only the two features missing from
// the plan (hosted_solution, unlimited_seats) belong in add_items, and the two the user
// excludes (revision_history, brand_controls) belong in remove_items. The array matcher
// is exact-length, so re-adding an already-present feature fails the case.
import { withCustomers } from "../../fixtures/createSetup.js";
import { billing, response, tools } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "feature-diff";

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

// Only the two features Scale lacks are added; the two excluded are removed.
// Anything already on the plan (priority_queue, approval_chains, compliance_controls)
// must NOT appear here.
const expectedAttachRequest = {
	customer_id: setup.refs.customers.meridian.id,
	entity_id: setup.refs.entities.workspace.id,
	plan_id: setup.refs.plans.scale.id,
	customize: {
		add_items: [
			{ feature_id: setup.refs.features.hosted_solution.id, unlimited: true },
			{ feature_id: setup.refs.features.unlimited_seats.id, unlimited: true },
		],
		remove_items: [
			{ feature_id: setup.refs.features.revision_history.id },
			{ feature_id: setup.refs.features.brand_controls.id },
		],
	},
};

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
			name: "adds only missing features and removes excluded ones",
			conversation: [
				user({
					message: `attach the Scale plan to kp-customer-0099. They get:
- priority queue
- approval chains
- compliance controls
- hosted solution
- unlimited seats
						`,
				}),
				user({ message: "Looks good, attach it." }),
				approve({ optional: false }),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listPlans",
						"listFeatures",
						"previewAttach",
						"attach",
					],
				}),
				...billing.previewThenWrite({
					body: expectedAttachRequest,
					write: "attach",
				}),
				response.mentions({
					phrases: [
						"Meridian Data",
						"Scale",
						"Hosted Solution",
						"Unlimited Seats",
					],
				}),
			],
		},
	],
});
