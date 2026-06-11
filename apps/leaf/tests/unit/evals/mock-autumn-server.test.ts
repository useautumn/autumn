import { describe, expect, test } from "bun:test";
import { BillingMethod } from "@api/products/components/billingMethod.js";
import { FeatureType } from "@models/featureModels/featureEnums.js";
import { TierBehavior } from "@models/productModels/priceModels/priceConfig/usagePriceConfig.js";
import {
	createSetup,
	withCustomers,
} from "../../evals/fixtures/createSetup.js";
import { orgSetups } from "../../evals/fixtures/orgSetups.js";
import { createAutumnApiMock } from "../../evals/harness/index.js";
import {
	askedClarification,
	askedClarificationBeforeTool,
	expectedApiBodyNumberFields,
	expectedApiCalls,
	expectedApiCallsAfterApproval,
	expectedToolCalls,
} from "../../evals/utils/scorers.js";

const createCustomerPlanSetup = () =>
	createSetup({
		tag: "joe-customized-pro-plan",
		features: ({ features }) => ({
			credits: features.creditSystem(),
			dashboard: features.boolean(),
		}),
		plans: ({ basePrice, features, items, plan }) => ({
			pro: plan.monthly({
				basePrice: basePrice.monthly({ amount: 79 }),
				items: [
					items.included({ feature: features.credits, included: 25_000 }),
					items.boolean({ feature: features.dashboard }),
				],
				planId: "pro",
			}),
		}),
		customers: ({ customers, plans, subscriptions }) => ({
			joe: customers.active({
				id: "joe_customer",
				name: "Joe",
				subscriptions: [subscriptions.active({ plan: plans.pro })],
			}),
		}),
	});

describe("eval mock Autumn server", () => {
	test("composes boolean feature lists into setup refs", () => {
		const setup = createSetup({
			tag: "boolean-feature-list",
			features: ({ featureList }) => ({
				...featureList.boolean({
					featureIds: ["sso", "audit_logs"],
					names: { sso: "SSO" },
				}),
			}),
			plans: ({ features, items, plan }) => ({
				pro: plan.monthly({
					items: [items.boolean({ feature: features.sso })],
					planId: "pro",
				}),
			}),
			customers: () => ({}),
		});

		expect(setup.refs.features.sso).toMatchObject({
			id: "sso",
			name: "SSO",
			type: FeatureType.Boolean,
		});
		expect(setup.ids.features.sso).toBe("sso");
		expect(setup.refs.features.audit_logs).toMatchObject({
			id: "audit_logs",
			name: "Audit Logs",
			type: FeatureType.Boolean,
		});
		expect(setup.plans[0]?.items[0]?.feature_id).toBe("sso");
	});

	test("composes anonymized knowledge platform org setup", () => {
		const setup = orgSetups.knowledgePlatform();
		const enterprise = setup.refs.plans.enterprise;
		const automationPack = setup.plans.find(
			(plan) => plan.id === setup.ids.plans.automationPack,
		);
		if (Array.isArray(enterprise) || !automationPack) {
			throw new Error("Expected single plan refs.");
		}

		const creditItems = enterprise.items.filter(
			(item) => item.feature_id === "credits",
		);
		const featureIds = setup.features.map((feature) => feature.id);

		expect(setup.refs.features.credits).toMatchObject({
			type: FeatureType.CreditSystem,
		});
		expect(enterprise.price).toBeNull();
		expect(setup.ids.features.insight_reports).toBe("insight_reports");
		expect(setup.ids.plans.enterprise).toBe("enterprise");
		expect(creditItems).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					price: expect.objectContaining({
						billing_method: BillingMethod.Prepaid,
						tier_behavior: TierBehavior.VolumeBased,
					}),
				}),
				expect.objectContaining({
					price: expect.objectContaining({
						billing_method: BillingMethod.UsageBased,
					}),
				}),
			]),
		);
		expect(featureIds.filter((id) => id !== "credits").length).toBeGreaterThan(
			10,
		);
		expect(automationPack).toMatchObject({
			add_on: true,
			items: [{ feature_id: "automation_rules" }],
		});
		expect(featureIds).not.toContain("AI_CHAT");
		expect(featureIds).not.toContain("AI_CREDITS");
	});

	test("extends reusable org setup with typed eval customers", () => {
		const setup = withCustomers({
			setup: orgSetups.knowledgePlatform(),
			customers: ({ customers, plans, subscriptions }) => ({
				joe: customers.active({
					id: "joe_customer",
					subscriptions: [subscriptions.active({ plan: plans.scale })],
				}),
			}),
		});

		expect(setup.ids.customers.joe).toBe("joe_customer");
		expect(setup.refs.customers.joe.subscriptions[0]?.plan_id).toBe(
			setup.ids.plans.scale,
		);
	});

	test("creates customized plan variants for customer subscriptions", () => {
		const setup = createSetup({
			tag: "custom-plan-version",
			features: ({ features }) => ({
				audit_logs: features.boolean({ featureId: "audit_logs" }),
				credits: features.creditSystem(),
				dashboard: features.boolean(),
			}),
			plans: ({ basePrice, features, items, plan }) => {
				const pro = plan.monthly({
					basePrice: basePrice.monthly({ amount: 79 }),
					items: [
						items.included({ feature: features.credits, included: 25_000 }),
						items.boolean({ feature: features.dashboard }),
					],
					planId: "pro",
				});

				return {
					pro,
					proCustom: plan.customized({
						customize: {
							add_items: [items.boolean({ feature: features.audit_logs })],
							price: basePrice.monthly({ amount: 99 }),
							remove_items: [{ feature_id: features.dashboard.id }],
						},
						plan: pro,
						planId: "pro_custom",
					}),
				};
			},
			customers: ({ customers, plans, subscriptions }) => ({
				joe: customers.active({
					id: "joe_customer",
					subscriptions: [subscriptions.active({ plan: plans.proCustom })],
				}),
			}),
		});

		const subscription = setup.refs.customers.joe.subscriptions[0];
		expect(subscription?.plan_id).toBe("pro_custom");
		expect(subscription?.plan).toMatchObject({
			base_variant_id: "pro",
			id: "pro_custom",
			price: { amount: 9_900 },
		});
		expect(subscription?.plan?.items.map((item) => item.feature_id)).toEqual([
			"credits",
			"audit_logs",
		]);
	});

	test("requires customized plan replacements to remove original items", () => {
		const setup = createSetup({
			tag: "custom-plan-duplicate-item",
			features: ({ features }) => ({
				credits: features.creditSystem(),
			}),
			plans: ({ features, items, plan }) => {
				const pro = plan.monthly({
					items: [items.included({ feature: features.credits, included: 100 })],
					planId: "pro",
				});

				expect(() =>
					plan.customized({
						customize: {
							add_items: [
								items.included({ feature: features.credits, included: 1_000 }),
							],
						},
						plan: pro,
					}),
				).toThrow("duplicate item");

				return { pro };
			},
			customers: () => ({}),
		});

		expect(setup.ids.plans.pro).toBe("pro");
	});

	test("composes customer schedule refs alongside scheduled subscriptions", () => {
		const setup = createSetup({
			tag: "customer-schedule",
			features: ({ features }) => ({
				credits: features.creditSystem(),
			}),
			plans: ({ features, items, plan }) => ({
				yearOne: plan.annual({
					items: [
						items.included({ feature: features.credits, included: 5_000 }),
					],
					planId: "year_one",
				}),
				yearTwo: plan.annual({
					items: [
						items.included({ feature: features.credits, included: 10_000 }),
					],
					planId: "year_two",
				}),
			}),
			customers: ({ customers, plans, subscriptions }) => ({
				joe: customers.active({
					id: "joe_customer",
					subscriptions: [
						subscriptions.active({ plan: plans.yearOne }),
						subscriptions.scheduled({
							plan: plans.yearTwo,
							startedAt: new Date("2027-01-01T00:00:00.000Z"),
						}),
					],
				}),
			}),
			schedules: ({ customers, schedules }) => ({
				joeContract: schedules.customer({
					customer: customers.joe,
					id: "sched_joe_contract",
					phases: [
						{
							customerProductIds: ["cus_prod_year_one"],
							startsAt: new Date("2026-01-01T00:00:00.000Z"),
						},
						{
							customerProductIds: ["cus_prod_year_two"],
							startsAt: new Date("2027-01-01T00:00:00.000Z"),
						},
					],
				}),
			}),
		});

		expect(setup.ids.schedules.joeContract).toBe("sched_joe_contract");
		expect(setup.schedules[0]?.phases.map((phase) => phase.starts_at)).toEqual([
			1_767_225_600_000, 1_798_761_600_000,
		]);
		expect(setup.refs.customers.joe.subscriptions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ plan_id: "year_two", status: "scheduled" }),
			]),
		);
	});

	test("generates customer search and get-or-create responses from setup state", async () => {
		const setup = createCustomerPlanSetup();
		const server = createAutumnApiMock({ setup });
		const customer = setup.refs.customers.joe;
		if (!customer) throw new Error("Eval setup is missing customer.");

		try {
			const listed = await fetch(`${server.serverURL}/v1/customers.list`, {
				body: JSON.stringify({ search: "Joe" }),
				method: "POST",
			}).then((response) => response.json());
			const fetched = await fetch(
				`${server.serverURL}/v1/customers.get_or_create`,
				{
					body: JSON.stringify({ customer_id: customer.id }),
					method: "POST",
				},
			).then((response) => response.json());

			expect(listed).toMatchObject({
				list: [{ id: customer.id, subscriptions: [{ plan_id: "pro" }] }],
				total_filtered_count: 1,
			});
			expect(fetched).toMatchObject({
				id: customer.id,
				subscriptions: [{ plan: { id: "pro", name: "Pro" } }],
			});
			expect(server.calls.map((call) => call.toolName)).toEqual([
				"listCustomers",
				"getOrCreateCustomer",
			]);
		} finally {
			server.restore();
		}
	});

	test("creates a customer through get-or-create when missing", async () => {
		const setup = createCustomerPlanSetup();
		const server = createAutumnApiMock({ setup });

		try {
			const created = await fetch(
				`${server.serverURL}/v1/customers.get_or_create`,
				{
					body: JSON.stringify({ customer_id: "new_customer" }),
					method: "POST",
				},
			).then((response) => response.json());

			expect(created).toMatchObject({ id: "new_customer" });
			expect(setup.customers.map((customer) => customer.id)).toContain(
				"new_customer",
			);
		} finally {
			server.restore();
		}
	});

	test("scores expected tool and API calls", () => {
		const output = {
			apiCalls: [
				{
					body: { search: "Joe" },
					endpoint: "/v1/customers.list",
					toolName: "listCustomers" as const,
				},
				{
					body: { customer_id: "joe_customer" },
					endpoint: "/v1/customers.get_or_create",
					toolName: "getOrCreateCustomer" as const,
				},
				{
					body: {
						customer_id: "joe_customer",
						invoice_mode: {
							enabled: true,
							enable_plan_immediately: true,
							finalize: false,
						},
					},
					endpoint: "/v1/billing.preview_attach",
					toolName: "previewAttach" as const,
				},
			],
			finalText: "Joe is on Pro for $79 per month.",
			toolCalls: [
				{ args: {}, name: "listCustomers" },
				{ args: {}, name: "getOrCreateCustomer" },
			],
		};

		expect(
			expectedApiCalls({
				expected: {
					apiCalls: [
						{
							body: { customer_id: "joe_customer" },
							toolName: "getOrCreateCustomer",
						},
					],
				},
				output,
			}),
		).toBe(1);
		expect(
			expectedToolCalls({
				expected: { toolCalls: ["listCustomers", "getOrCreateCustomer"] },
				output,
			}),
		).toBe(1);
		expect(
			expectedApiCalls({
				expected: {
					apiCalls: [
						{
							body: {
								customer_id: "joe_customer",
								invoice_mode: {
									enable_plan_immediately: true,
									enabled: true,
									finalize: false,
								},
							},
							toolName: "previewAttach",
						},
					],
				},
				output,
			}),
		).toBe(1);
		expect(
			askedClarification({
				expected: [
					{
						phrases: ["customer id", "entity name"],
						notPhrases: ["deployment"],
						type: "response.asked",
					},
				],
				output: {
					...output,
					turns: [
						{
							text: "Please provide the customer_id, email, entity_id, and entity name.",
							type: "user",
						},
					],
				},
			}),
		).toBe(1);
		expect(
			askedClarificationBeforeTool({
				expected: [
					{
						phrases: ["customer id", "entity name"],
						toolName: "getOrCreateCustomer",
						type: "response.askedBeforeTool",
					},
				],
				output: {
					...output,
					turns: [
						{
							text: "Please provide the customer_id, email, entity_id, and entity name.",
							toolCalls: [{ args: {}, name: "listPlans" }],
							type: "user",
						},
					],
				},
			}),
		).toBe(1);
		expect(
			expectedApiCallsAfterApproval({
				expected: [
					{
						call: {
							body: { customer_id: "joe_customer" },
							toolName: "attach",
						},
						type: "api.calledAfterApproval",
					},
				],
				output: {
					...output,
					apiCalls: [
						...output.apiCalls,
						{
							body: { customer_id: "joe_customer" },
							endpoint: "/v1/billing.attach",
							toolName: "attach",
						},
					],
					turns: [
						{
							apiCalls: output.apiCalls,
							type: "user",
						},
						{
							apiCalls: [
								...output.apiCalls,
								{
									body: { customer_id: "joe_customer" },
									endpoint: "/v1/billing.attach",
									toolName: "attach",
								},
							],
							type: "approve",
						},
					],
				},
			}),
		).toBe(1);
		expect(
			expectedApiBodyNumberFields({
				expected: [
					{
						paths: ["phases.*.starts_at"],
						toolName: "previewCreateSchedule",
						type: "api.bodyNumberFields",
					},
				],
				output: {
					...output,
					apiCalls: [
						...output.apiCalls,
						{
							body: {
								phases: [
									{ starts_at: 1_806_537_600_000 },
									{ starts_at: 1_814_400_000_000 },
								],
							},
							endpoint: "/v1/billing.preview_create_schedule",
							toolName: "previewCreateSchedule",
						},
					],
				},
			}),
		).toBe(1);
		expect(
			expectedApiBodyNumberFields({
				expected: [
					{
						paths: ["phases.*.starts_at"],
						toolName: "previewCreateSchedule",
						type: "api.bodyNumberFields",
					},
				],
				output: {
					...output,
					apiCalls: [
						...output.apiCalls,
						{
							body: {
								phases: [
									{ starts_at: "1 April 2027 00:00 UTC (1806537600000)" },
								],
							},
							endpoint: "/v1/billing.preview_create_schedule",
							toolName: "previewCreateSchedule",
						},
					],
				},
			}),
		).toBe(0);
		expect(
			expectedApiBodyNumberFields({
				expected: [
					{
						paths: ["phases.*.starts_at"],
						toolName: "createSchedule",
						type: "api.bodyNumberFields",
					},
				],
				output,
			}),
		).toBe(0);
	});
});
