import { createSetup } from "../../../fixtures/createSetup.js";
import { subscriptions } from "../../../fixtures/customers/presets/subscriptions.js";
import {
	api,
	response,
	state,
	tools,
} from "../../../fixtures/expectations/index.js";
import { approve, initEval, user } from "../../../harness/index.js";

type EvalMetadata = {
	domain: "billing";
	flow: "attach";
};

const experimentName = "attach-messy-state";

const HOUR_MS = 60 * 60 * 1000;
const now = new Date("2026-08-19T12:00:00.000Z");

// Modelled on a real customer: a $0 add-on at customer scope, a trial and a
// paused plan on one entity, a past-due annual plan on another. The org
// attaches to entities, so "put them on Enterprise" is ambiguous about scope.
const setup = createSetup({
	tag: "attach-messy-state",
	agentRules: ({ agentRules }) =>
		agentRules.base({
			entityRules: agentRules.entityRules({
				attachToEntities: true,
				entityFeatureId: "deployments",
			}),
		}),
	features: ({ features }) => ({
		ai_credits: features.consumable({ featureId: "ai_credits" }),
		deployments: features.boolean({
			featureId: "deployments",
			name: "Deployments",
		}),
		seats: features.allocated({ featureId: "seats" }),
	}),
	plans: ({ basePrice, features, items, plan }) => ({
		custom_ai_credits: plan.addOn({
			basePrice: basePrice.monthly({ amount: 0 }),
			items: [items.included({ feature: features.ai_credits, included: 500 })],
			name: "Custom AI Credits",
			planId: "custom_ai_credits",
		}),
		enterprise: plan.monthly({
			basePrice: basePrice.monthly({ amount: 2000 }),
			items: [items.included({ feature: features.seats, included: 100 })],
			name: "Enterprise",
			planId: "enterprise",
		}),
		growth_yearly: plan.annual({
			basePrice: basePrice.annual({ amount: 6600 }),
			items: [items.included({ feature: features.seats, included: 25 })],
			name: "Growth (Yearly)",
			planId: "growth_yearly",
		}),
		hobby: plan.monthly({
			basePrice: null,
			items: [items.included({ feature: features.seats, included: 1 })],
			name: "Hobby",
			planId: "hobby",
		}),
		pro: plan.monthly({
			basePrice: basePrice.monthly({ amount: 40 }),
			items: [items.included({ feature: features.seats, included: 5 })],
			name: "Pro",
			planId: "pro",
		}),
	}),
	customers: ({ customers, plans, subscriptions }) => ({
		orbit: {
			...customers.base({
				email: "james@orbit-labs.example",
				id: "cus_orbit",
				name: "Orbit Labs",
			}),
			subscriptions: [
				{
					...subscriptions.active({ plan: plans.custom_ai_credits }),
					add_on: true,
				},
			],
		},
	}),
	entities: ({ customers, entities, features }) => ({
		helpCenter: {
			...entities.base({
				customer: customers.orbit,
				feature: features.deployments,
				id: "orbit-help-center",
				name: "orbit-help-center",
			}),
			subscriptions: [
				{
					...subscriptions.active({ planId: "pro" }),
					trial_ends_at: now.getTime() + HOUR_MS,
				},
				{
					...subscriptions.active({ planId: "hobby" }),
					current_period_end: null,
				},
			],
		},
		main: {
			...entities.base({
				customer: customers.orbit,
				feature: features.deployments,
				id: "orbit",
				name: "orbit",
			}),
			subscriptions: [
				{
					...subscriptions.active({ planId: "growth_yearly" }),
					past_due: true,
				},
			],
		},
	}),
});

const ORBIT_ID = "cus_orbit";
const cancelImmediately = (planId: string, entityId?: string) => ({
	body: {
		cancel_action: "cancel_immediately",
		customer_id: ORBIT_ID,
		plan_id: planId,
		...(entityId ? { entity_id: entityId } : {}),
	},
	toolName: "updateSubscription" as const,
});

initEval<EvalMetadata>({
	experimentName,
	setup,
	metadata: { domain: "billing", flow: "attach" },
	timeout: 240_000,
	today: now,
	cases: [
		{
			name: "read-only: sees every subscription across scopes",
			conversation: [
				user({ message: "What plans is Orbit Labs on right now?" }),
			],
			expect: [
				api.calledTimes({ call: { toolName: "attach" }, count: 0 }),
				api.calledTimes({ call: { toolName: "updateSubscription" }, count: 0 }),
				response.mentions({
					phrases: [
						"AI Credits",
						"Pro",
						"trial",
						"Hobby",
						"Growth",
						"past due",
						"help-center",
					],
				}),
			],
		},
		{
			// The headline case: no single API call does this, so the agent must
			// resolve scope, surface what "only plan" removes, then compose
			// one attach with four immediate cancels.
			name: "make enterprise the only plan, customer scope",
			conversation: [
				user({
					message:
						"Put Orbit Labs on Enterprise and make it the only plan they have.",
					maxSteps: 24,
				}),
				user({
					message:
						"Customer level, not an entity. Yes — cancel all of the others immediately, including the credits add-on and the past-due Growth plan.",
					maxSteps: 24,
				}),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
			],
			expect: [
				response.askedBeforeTool({
					phrases: ["entity"],
					toolName: "previewAttach",
				}),
				tools.called({ toolNames: ["previewAttach", "attach"] }),
				api.calledTimes({ call: { toolName: "attach" }, count: 1 }),
				api.calledTimes({ call: { toolName: "updateSubscription" }, count: 4 }),
				api.called({
					calls: [
						{
							body: { customer_id: ORBIT_ID, plan_id: "enterprise" },
							toolName: "attach",
						},
						cancelImmediately("custom_ai_credits"),
						cancelImmediately("pro", "orbit-help-center"),
						cancelImmediately("hobby", "orbit-help-center"),
						cancelImmediately("growth_yearly", "orbit"),
					],
				}),
				api.bodyExcludes({ fields: ["entity_id"], toolName: "attach" }),
				state.subscriptions({
					customer: ["enterprise"],
					customerId: ORBIT_ID,
					entities: { "orbit-help-center": [], orbit: [] },
				}),
			],
		},
		{
			name: "make enterprise the only plan, on the main entity",
			conversation: [
				user({
					message:
						"Put Orbit Labs on Enterprise and make it the only plan they have.",
					maxSteps: 24,
				}),
				user({
					message:
						"Attach it to the orbit entity. Yes — cancel everything else immediately, including the credits add-on and the past-due Growth plan.",
					maxSteps: 24,
				}),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
				approve({ maxSteps: 24 }),
			],
			expect: [
				api.calledTimes({ call: { toolName: "attach" }, count: 1 }),
				api.called({
					calls: [
						{
							body: {
								customer_id: ORBIT_ID,
								entity_id: "orbit",
								plan_id: "enterprise",
							},
							toolName: "attach",
						},
					],
				}),
				state.subscriptions({
					customer: [],
					customerId: ORBIT_ID,
					entities: { "orbit-help-center": [], orbit: ["enterprise"] },
				}),
			],
		},
		{
			// The counterweight: a plain attach onto a messy customer must not
			// become a clean-up the user never asked for.
			name: "plain attach leaves the other subscriptions alone",
			conversation: [
				user({
					message: "Attach Enterprise to Orbit Labs at the customer level.",
					maxSteps: 24,
				}),
				user({ message: "Looks good, attach it.", maxSteps: 24 }),
				approve({ maxSteps: 24 }),
			],
			expect: [
				api.calledTimes({ call: { toolName: "attach" }, count: 1 }),
				api.calledTimes({ call: { toolName: "updateSubscription" }, count: 0 }),
				state.subscriptions({
					customer: ["custom_ai_credits", "enterprise"],
					customerId: ORBIT_ID,
					entities: {
						"orbit-help-center": ["pro", "hobby"],
						orbit: ["growth_yearly"],
					},
				}),
			],
		},
	],
});
