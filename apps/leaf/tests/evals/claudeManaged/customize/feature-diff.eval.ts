// Tests the agent's ability to diff a requested boolean-feature list against what
// the Scale plan already grants, treating the list as the exhaustive set: features
// on the plan but not listed must be removed, listed features missing from the plan
// must be added, and listed features already on the plan are no-ops.
import { withCustomers } from "../../fixtures/createSetup.js";
import { billing, response, tools } from "../../fixtures/expectations/index.js";
import { orgSetups } from "../../fixtures/orgSetups.js";
import {
	approve,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../../harness/index.js";

const userPrompt = `attach the Scale plan to kp-customer-0099. They get:
- priority queue
- approval chains
- compliance controls
- hosted solution
- unlimited seats`;

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
			id: "kp-customer-0099",
			name: "Meridian Data",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		workspace: entities.base({
			customer: customers.meridian,
			feature: features.workspaces,
			id: "kp-customer-0099-main",
			name: "Main",
		}),
	}),
});

// Add the two listed features Scale lacks; remove the nine Scale booleans the
// list omits. The three listed features already on Scale (priority_queue,
// approval_chains, compliance_controls) stay untouched.
const features = setup.refs.features;
const expectedAttachRequest = {
	customer_id: setup.refs.customers.meridian.id,
	entity_id: setup.refs.entities.workspace.id,
	plan_id: setup.refs.plans.scale.id,
	customize: {
		add_items: [
			{ feature_id: features.hosted_solution.id, unlimited: true },
			{ feature_id: features.unlimited_seats.id, unlimited: true },
		],
		remove_items: [
			{ feature_id: features.insight_reports.id },
			{ feature_id: features.team_policies.id },
			{ feature_id: features.private_spaces.id },
			{ feature_id: features.export_center.id },
			{ feature_id: features.automation_rules.id },
			{ feature_id: features.platform_api.id },
			{ feature_id: features.outbound_hooks.id },
			{ feature_id: features.brand_controls.id },
			{ feature_id: features.revision_history.id },
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
			name: "diffs the listed set against the plan: adds missing, removes extras",
			conversation: [
				user({ message: userPrompt }),
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
