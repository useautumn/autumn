// Multi-entity provisioning: one signed order form, two workspaces under the
// same customer, a different package and price attached per entity.
import { withCustomers } from "../fixtures/createSetup.js";
import {
	api,
	billing,
	response,
	tools,
} from "../fixtures/expectations/index.js";
import { orgSetups } from "../fixtures/orgSetups.js";
import {
	approve,
	contractAttachment,
	createClaudeManagedLiveDriver,
	initEval,
	user,
} from "../harness/index.js";
import { billingAttachScores } from "../utils/scorers.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "attach-multi-entity";

const setup = withCustomers({
	setup: orgSetups.knowledgePlatform(),
	customers: ({ customers }) => ({
		silvercrest: customers.base({
			email: "ap@silvercrestmedia.example",
			id: "silvercrest-media",
			name: "Silvercrest Media, Inc.",
		}),
	}),
	entities: ({ customers, entities, features }) => ({
		newsroom: entities.base({
			customer: customers.silvercrest,
			feature: features.workspaces,
			id: "silvercrest-newsroom",
			name: "Newsroom",
		}),
		archive: entities.base({
			customer: customers.silvercrest,
			feature: features.workspaces,
			id: "silvercrest-archive",
			name: "Archive",
		}),
	}),
});

const customer = setup.refs.customers.silvercrest;

const invoiceMode = {
	enable_plan_immediately: true,
	enabled: true,
	finalize: false,
	net_terms_days: 30,
};

const expectedNewsroomAttach = {
	customer_id: customer.id,
	customize: {
		add_items: [
			{
				feature_id: setup.refs.features.hosted_solution.id,
				unlimited: true,
			},
		],
		price: { amount: 1_150, interval: "month" },
		remove_items: [{ feature_id: setup.refs.features.revision_history.id }],
	},
	entity_id: setup.refs.entities.newsroom.id,
	invoice_mode: invoiceMode,
	plan_id: setup.refs.plans.enterprise.id,
};

const expectedArchiveAttach = {
	customer_id: customer.id,
	customize: {
		price: { amount: 650, interval: "month" },
		remove_items: [{ feature_id: setup.refs.features.compliance_controls.id }],
	},
	entity_id: setup.refs.entities.archive.id,
	invoice_mode: invoiceMode,
	plan_id: setup.refs.plans.scale.id,
};

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: {
		domain: "billing",
		flow: "attach",
	},
	driver: createClaudeManagedLiveDriver(),
	scores: billingAttachScores(),
	timeout: 300_000,
	cases: [
		{
			name: "order form with two workspace packages attaches each entity separately",
			conversation: [
				user({
					attachments: [
						contractAttachment({ fixtureId: "multi-workspace-order" }),
					],
					message:
						"I uploaded the signed order form for Silvercrest Media. Please provision both workspaces in Autumn.",
				}),
				user({ message: "Looks good, attach both." }),
				approve(),
				// Optional: the agent may batch both writes under one approval.
				approve({ optional: true }),
			],
			expect: [
				tools.called({
					toolNames: [
						"getAgentRules",
						"listPlans",
						"listFeatures",
						"listCustomers",
						"listEntities",
						"previewAttach",
						"attach",
					],
				}),
				// Both entities exist; discover them, don't mint duplicates.
				api.calledTimes({ call: { toolName: "createEntity" }, count: 0 }),
				...billing.previewThenWrite({
					body: expectedNewsroomAttach,
					write: "attach",
				}),
				...billing.previewThenWrite({
					body: expectedArchiveAttach,
					write: "attach",
				}),
				api.calledTimes({
					call: { body: expectedNewsroomAttach, toolName: "attach" },
					count: 1,
				}),
				api.calledTimes({
					call: { body: expectedArchiveAttach, toolName: "attach" },
					count: 1,
				}),
				api.calledTimes({ call: { toolName: "attach" }, count: 2 }),
				// Preview totals are not pinned; error-recovery re-previews are fine.
				api.calledTimes({
					call: { body: expectedNewsroomAttach, toolName: "previewAttach" },
					count: 1,
				}),
				api.calledTimes({
					call: { body: expectedArchiveAttach, toolName: "previewAttach" },
					count: 1,
				}),
				// Single-term order form effective on provisioning: attach, not a schedule.
				api.calledTimes({ call: { toolName: "createSchedule" }, count: 0 }),
				api.calledTimes({
					call: { toolName: "previewCreateSchedule" },
					count: 0,
				}),
				// No backdating to signature dates, items PUT, trial, or prepaid quantities.
				...(["previewAttach", "attach"] as const).map((toolName) =>
					api.bodyExcludes({
						fields: [
							"starts_at",
							"ends_at",
							"feature_quantities",
							"no_billing_changes",
							"entity_data",
							"customize.items",
							"customize.free_trial",
						],
						toolName,
					}),
				),
				response.mentions({
					phrases: [
						"Silvercrest",
						"Newsroom",
						"Archive",
						"Enterprise",
						"Scale",
						"Hosted Solution",
					],
				}),
			],
		},
	],
});
