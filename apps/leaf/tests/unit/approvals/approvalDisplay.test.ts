import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { resolveApprovalDisplay } from "../../../src/internal/approvals/utils/approvalDisplay.js";

describe("resolveApprovalDisplay", () => {
	test("reuses the preview plan name and resolves the customer label", async () => {
		const calls: Array<{ request: unknown; toolName: string }> = [];
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ args, toolName }) => {
				calls.push({ request: args.request, toolName });
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								email: "billing@key-people.example",
								name: "Key People",
							}),
						},
					],
				};
			},
			getToken: async () => "token",
			preview: {
				incoming: [{ plan_id: "enterprise", plan: { name: "Enterprise" } }],
			},
			request: {
				customer_id: "kp-customer-1000",
				plan_id: "enterprise",
			},
		});

		expect(display).toEqual({
			basePlanItems: null,
			currentPlan: null,
			customerEmail: "billing@key-people.example",
			customerName: "Key People",
			planName: "Enterprise",
			planNames: { enterprise: "Enterprise" },
		});
		expect(calls).toEqual([
			{
				request: {
					customer_id: "kp-customer-1000",
					expand: ["subscriptions.plan"],
					with_autumn_id: false,
				},
				toolName: "getCustomer",
			},
		]);
	});

	test("fetches missing labels and keeps email as the customer fallback", async () => {
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => ({
				content: [
					{
						type: "text",
						text: JSON.stringify(
							toolName === "getPlan"
								? {
										items: [{ feature_id: "messages", included: 800 }],
										name: "Growth",
									}
								: { email: "billing@example.com", name: "" },
						),
					},
				],
			}),
			getToken: async () => "token",
			preview: undefined,
			request: { customer_id: "cus_1", plan_id: "growth" },
		});

		const growth = {
			items: [{ feature_id: "messages", included: 800 }],
			name: "Growth",
		};
		expect(display).toEqual({
			basePlanItems: growth.items,
			basePlanItemsByPlan: { growth: growth.items },
			currentPlan: growth,
			currentPlanByPlan: { growth },
			customerEmail: "billing@example.com",
			customerName: null,
			planName: "Growth",
			planNames: { growth: "Growth" },
		});
	});

	test("fetches the catalog items for full item replacements", async () => {
		const calls: string[] = [];
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => {
				calls.push(toolName);
				return toolName === "listFeatures"
					? {
							list: [
								{
									display: { plural: "gigabytes", singular: "gigabyte" },
									id: "storage",
									name: "Storage",
								},
							],
						}
					: { items: [{ feature_id: "messages" }], name: "Growth" };
			},
			getToken: async () => "token",
			preview: {
				incoming: [{ plan_id: "growth", plan: { name: "Growth" } }],
			},
			request: {
				customize: { items: [{ feature_id: "storage" }] },
				plan_id: "growth",
			},
		});

		expect(display.basePlanItems).toEqual([{ feature_id: "messages" }]);
		expect(display.basePlanItemsByPlan).toEqual({
			growth: [{ feature_id: "messages" }],
		});
		expect(display.featureNames).toEqual({
			storage: {
				name: "Storage",
				plural: "gigabytes",
				singular: "gigabyte",
			},
		});
		expect([...calls].sort()).toEqual(["getPlan", "listFeatures"].sort());
	});

	test("resolves feature labels used by schedule customizations", async () => {
		const calls: string[] = [];
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => {
				calls.push(toolName);
				return toolName === "getPlan"
					? { name: "Pro" }
					: {
							list: [
								{
									display: { plural: "messages", singular: "message" },
									id: "messages",
									name: "Messages",
								},
							],
						};
			},
			getToken: async () => "token",
			preview: undefined,
			request: {
				customer_id: "cus_1",
				phases: [
					{
						plans: [
							{
								customize: {
									add_items: [{ feature_id: "messages", included: 100 }],
								},
								plan_id: "pro",
							},
						],
					},
				],
			},
		});

		expect(display.featureNames).toEqual({
			messages: {
				name: "Messages",
				plural: "messages",
				singular: "message",
			},
		});
		expect(display.planNames).toEqual({ pro: "Pro" });
		expect(calls).toEqual(["getCustomer", "listFeatures", "getPlan"]);
	});

	test("resolves names nested in catalog updates", async () => {
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) =>
				toolName === "getPlan"
					? { name: "Growth seed" }
					: {
							list: [
								{
									id: "footballs",
									name: "Footballs",
								},
							],
						},
			getToken: async () => "token",
			preview: {
				plan_changes: [
					{
						action: "updated",
						item_changes: [],
						plan_id: "growth_seed",
					},
				],
			},
			request: {
				plans: [
					{
						items: [{ feature_id: "footballs" }],
						plan_id: "growth_seed",
					},
				],
			},
		});

		expect(display.planNames).toEqual({ growth_seed: "Growth seed" });
		expect(display.featureNames).toEqual({
			footballs: { name: "Footballs", plural: null, singular: null },
		});
	});

	test("fetches the base plan for a price-only customize so the old price renders as a remove", async () => {
		const calls: string[] = [];
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => {
				calls.push(toolName);
				return toolName === "getPlan"
					? {
							name: "Transactional Pro",
							price: { amount: 25, interval: "month" },
						}
					: {
							email: "test@example.com",
							name: "testmail",
							subscriptions: [
								{
									plan: {
										id: "transactional_pro",
										name: "Transactional Pro",
										price: { amount: 20, interval: "month" },
									},
									plan_id: "transactional_pro",
								},
							],
						};
			},
			getToken: async () => "token",
			preview: {
				incoming: [
					{ plan_id: "transactional_pro", plan: { name: "Transactional Pro" } },
				],
			},
			request: {
				customer_id: "cus_1",
				customize: { price: { amount: 40, interval: "month" } },
				plan_id: "transactional_pro",
			},
		});

		expect(calls).toContain("getPlan");
		expect(display.currentPlan).toEqual({
			id: "transactional_pro",
			name: "Transactional Pro",
			price: { amount: 20, interval: "month" },
		});
	});

	test("a top-level free trial also fetches the base plan for the diff", async () => {
		const calls: string[] = [];
		await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => {
				calls.push(toolName);
				return { name: "Pro" };
			},
			getToken: async () => "token",
			preview: {
				incoming: [{ plan_id: "pro", plan: { name: "Pro" } }],
			},
			request: {
				free_trial: { duration_length: 14, duration_type: "day" },
				plan_id: "pro",
			},
		});

		expect(calls).toContain("getPlan");
	});

	test("resolves schedule plan items needed for removal rows", async () => {
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) =>
				toolName === "getPlan"
					? {
							items: [{ feature_id: "messages", included: 800 }],
							name: "Pro",
						}
					: { list: [] },
			getToken: async () => "token",
			preview: undefined,
			request: {
				phases: [
					{
						plans: [
							{
								customize: { remove_items: [{ feature_id: "messages" }] },
								plan_id: "pro",
							},
						],
					},
				],
			},
		});

		expect(display.basePlanItemsByPlan).toEqual({
			pro: [{ feature_id: "messages", included: 800 }],
		});
		expect(display.planNames).toEqual({ pro: "Pro" });
	});
});

// remove_items is a filter; the quantity being removed is what the customer
// currently holds. A customized subscription can differ from the catalog
// plan, so the customer's live items must take precedence when present.
describe("base items prefer the customer's live subscription", () => {
	test("uses the subscription's customized items over the catalog plan", async () => {
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => ({
				content: [
					{
						type: "text",
						text: JSON.stringify(
							toolName === "getPlan"
								? {
										items: [{ feature_id: "contacts", included: 0 }],
										name: "Enterprise",
									}
								: {
										email: "ops@atlas.example",
										name: "Atlas Management Group",
										subscriptions: [
											{
												plan: {
													id: "enterprise",
													items: [
														{ feature_id: "contacts", included: 250_000 },
													],
													name: "Enterprise",
												},
												plan_id: "enterprise",
											},
										],
									},
						),
					},
				],
			}),
			getToken: async () => "token",
			preview: undefined,
			request: {
				customer_id: "cus_atlas",
				customize: { remove_items: [{ feature_id: "contacts" }] },
				plan_id: "enterprise",
			},
		});

		expect(display.basePlanItems).toEqual([
			{ feature_id: "contacts", included: 250_000 },
		]);
	});

	test("falls back to the catalog plan when the customer has no such subscription", async () => {
		const display = await resolveApprovalDisplay({
			env: AppEnv.Sandbox,
			executeTool: async ({ toolName }) => ({
				content: [
					{
						type: "text",
						text: JSON.stringify(
							toolName === "getPlan"
								? { items: [{ feature_id: "seats", included: 5 }], name: "Pro" }
								: {
										email: "new@example.com",
										name: "Newco",
										subscriptions: [],
									},
						),
					},
				],
			}),
			getToken: async () => "token",
			preview: undefined,
			request: { customer_id: "cus_new", plan_id: "pro" },
		});

		expect(display.basePlanItems).toEqual([
			{ feature_id: "seats", included: 5 },
		]);
	});
});
