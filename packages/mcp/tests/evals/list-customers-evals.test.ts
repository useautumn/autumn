import { expect, test } from "bun:test";
import {
	expectNoApiCall,
	expectNoToolCall,
	expectToolCall,
	initMcpEval,
	type ToolRequest,
} from "../utils/eval-test-utils.js";

const expectVersions = (versions: number[] | undefined, expected: number[]) => {
	expect(Array.from(new Set(versions ?? [])).sort((a, b) => a - b)).toEqual(
		expected,
	);
};

test("lists all matching customers with compound filters and cursor pagination", async () => {
	const cursors: string[] = [];
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listCustomers: (body: ToolRequest<"listCustomers">) => {
				cursors.push(body.start_cursor);
				expect(body).toMatchObject({
					search: "acme",
					subscription_status: "active",
					processors: ["stripe"],
					plans: [{ id: "pro", versions: [2, 3] }],
				});

				if (body.start_cursor === "") {
					expect(body.start_cursor).toBe("");
					return {
						list: [
							{
								id: "cus_acme_us",
								name: "Acme US",
								email: "billing@acme.example",
								processors: { stripe: { id: "cus_stripe_us" } },
								subscriptions: [{ planId: "pro", version: 3, status: "active" }],
							},
							{
								id: "cus_acme_eu",
								name: "Acme EU",
								email: "finance@acme.example",
								processors: { stripe: { id: "cus_stripe_eu" } },
								subscriptions: [{ planId: "pro", version: 2, status: "active" }],
							},
						],
						next_cursor: "cursor_acme_2",
					};
				}

				expect(body.start_cursor).toBe("cursor_acme_2");
				return {
					list: [
						{
							id: "cus_acme_apac",
							name: "Acme APAC",
							email: "ops-apac@acme.example",
							processors: { stripe: { id: "cus_stripe_apac" } },
							subscriptions: [{ planId: "pro", version: 3, status: "active" }],
						},
					],
					next_cursor: null,
				};
			},
		},
	});

	const output = await generate(
		[
			"Can you pull every active Acme customer on pro v2 or v3 that pays through Stripe?",
			"There may be multiple pages, so don't stop after the first batch.",
			"Just give me the customer ids.",
		],
		6,
	);

	expectToolCall(toolCalls, "listCustomers");
	expectNoToolCall(toolCalls, "getCustomer");
	expectNoApiCall(api, "getCustomer");
	const calls = api.callsFor("listCustomers");
	expect(calls.length).toBeGreaterThanOrEqual(2);
	expect(calls.some((call) => call.body.start_cursor === "")).toBe(true);
	expect(calls.some((call) => call.body.start_cursor === "cursor_acme_2")).toBe(
		true,
	);
	expect(output.text).toContain("cus_acme_us");
	expect(output.text).toContain("cus_acme_eu");
	expect(output.text).toContain("cus_acme_apac");
	expect(cursors).toContain("");
	expect(cursors).toContain("cursor_acme_2");
}, 30000);

test("resolves plan attributes before listing scheduled Vercel customers", async () => {
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listPlans: {
				list: [
					{
						id: "startup",
						name: "Startup",
						version: 1,
						is_default: true,
					},
					{
						id: "enterprise",
						name: "Enterprise",
						version: 4,
						is_default: false,
					},
					{
						id: "enterprise",
						name: "Enterprise",
						version: 5,
						is_default: false,
					},
					{
						id: "support_addon",
						name: "Priority Support",
						version: 2,
						is_add_on: true,
					},
				],
			},
			listCustomers: (body: ToolRequest<"listCustomers">) => {
				const versions = body.plans
					?.filter((plan) => plan.id === "enterprise")
					.flatMap((plan) => plan.versions ?? []);
				expect(body).toMatchObject({
					subscription_status: "scheduled",
					processors: ["vercel"],
					plans: [{ id: "enterprise" }],
				});
				expectVersions(versions, [4, 5]);
				return {
					list: [
						{
							id: "cus_future_enterprise",
							name: "Future Enterprise",
							processors: {
								vercel: {
									installation_id: "icfg_future",
									account_id: "acct_future",
								},
							},
							subscriptions: [
								{
									planId: "enterprise",
									version: 5,
									status: "scheduled",
								},
							],
						},
					],
					next_cursor: null,
				};
			},
		},
	});

	const output = await generate(
		[
			"Which Vercel customers are queued for non-default Enterprise plans?",
			"Return the customer ids.",
		],
		5,
	);

	expectToolCall(toolCalls, "listPlans");
	expectToolCall(toolCalls, "listCustomers");
	const enterpriseCall = api.callsFor("listCustomers").find((call) => {
		const versions = call.body.plans
			?.filter((plan) => plan.id === "enterprise")
			.flatMap((plan) => plan.versions ?? []);
		return (
			call.body.subscription_status === "scheduled" &&
			call.body.processors?.includes("vercel") &&
			Array.from(new Set(versions ?? [])).sort().join(",") === "4,5"
		);
	});
	expect(
		enterpriseCall,
		`Expected a scheduled Enterprise Vercel query. Calls: ${JSON.stringify(api.callsFor("listCustomers"), null, 2)}`,
	).toBeDefined();
	expectNoToolCall(toolCalls, "getCustomer");
	expectNoApiCall(api, "getCustomer");
	expect(output.text).toContain("cus_future_enterprise");
}, 30000);

test("infers active Stripe customer filters from vague wording", async () => {
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listCustomers: (body: ToolRequest<"listCustomers">) => {
				expect(body).toMatchObject({
					subscription_status: "active",
					processors: ["stripe"],
				});
				expect(body.search?.toLowerCase()).toBe("acme");
				return {
					list: [
						{
							id: "cus_acme_live",
							name: "Acme Live",
							email: "billing@acme.example",
							processors: { stripe: { id: "cus_stripe_live" } },
							subscriptions: [{ planId: "pro", status: "active" }],
						},
					],
					next_cursor: null,
				};
			},
		},
	});

	const output = await generate([
		"Can you find live Acme customers that are paying through Stripe?",
		"Return the customer ids.",
	]);

	expectToolCall(toolCalls, "listCustomers");
	expect(api.call("listCustomers")?.rawBody).toMatchObject({
		subscription_status: "active",
		processors: ["stripe"],
	});
	expect(api.call("listCustomers")?.rawBody.search?.toLowerCase()).toBe("acme");
	expectNoToolCall(toolCalls, "getCustomer");
	expectNoApiCall(api, "getCustomer");
	expect(api.callsFor("listCustomers").length).toBeGreaterThanOrEqual(1);
	expect(output.text).toContain("cus_acme_live");
}, 30000);

test("infers upcoming plan filters from vague scheduled language", async () => {
	const { api, generate, toolCalls } = initMcpEval({
		fixtures: {
			listPlans: {
				list: [
					{ id: "starter", name: "Starter", version: 1 },
					{ id: "growth", name: "Growth", version: 2 },
					{ id: "growth", name: "Growth", version: 3 },
				],
			},
			listCustomers: (body: ToolRequest<"listCustomers">) => {
				const growthVersions = body.plans
					?.filter((plan) => plan.id === "growth")
					.flatMap((plan) => plan.versions ?? []);
				const hasGrowthVersions =
					body.subscription_status === "scheduled" &&
					JSON.stringify(Array.from(new Set(growthVersions ?? [])).sort()) ===
						JSON.stringify([2, 3]);

				return {
					list: hasGrowthVersions
						? [
								{
									id: "cus_growth_next",
									name: "Growth Next",
									subscriptions: [
										{ planId: "growth", version: 3, status: "scheduled" },
									],
								},
							]
						: [
								{
									id: "cus_unrelated_scheduled",
									name: "Unrelated Scheduled",
									subscriptions: [
										{ planId: "starter", version: 1, status: "scheduled" },
									],
								},
							],
					next_cursor: null,
				};
			},
		},
	});

	const output = await generate([
		"Who is queued up to move onto any Growth version soon?",
		"Return the customer ids.",
	]);

	expectToolCall(toolCalls, "listPlans");
	expectToolCall(toolCalls, "listCustomers");
	const customerCall = api.callsFor("listCustomers").find((call) => {
		const versions = call.body.plans
			?.filter((plan) => plan.id === "growth")
			.flatMap((plan) => plan.versions ?? []);
		return (
			call.body.subscription_status === "scheduled" &&
			Array.from(new Set(versions ?? [])).sort().join(",") === "2,3"
		);
	});
	expect(
		customerCall,
		`Expected a scheduled Growth customer query. Calls: ${JSON.stringify(api.callsFor("listCustomers"), null, 2)}`,
	).toBeDefined();
	expect(customerCall?.body.subscription_status).toBe("scheduled");
	expect(customerCall?.body.plans?.some((plan) => plan.id === "growth")).toBe(
		true,
	);
	expectVersions(
		customerCall?.body.plans
			?.filter((plan) => plan.id === "growth")
			.flatMap((plan) => plan.versions ?? []),
		[2, 3],
	);
	expectNoToolCall(toolCalls, "getCustomer");
	expectNoApiCall(api, "getCustomer");
	expect(output.text).toContain("cus_growth_next");
}, 30000);
