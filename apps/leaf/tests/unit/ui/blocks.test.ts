import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { cardToBlockKit } from "@chat-adapter/slack";
import {
	approvalCard,
	approvalDetailsModal,
	approvalPayloadModal,
	approvalStatusCard,
} from "../../../src/ui/blocks.js";

const wrapMcpResult = (payload: unknown) => ({
	content: [{ type: "text", text: JSON.stringify(payload) }],
	isError: false,
});

const attachArgs = {
	request: {
		customer_id: "kp-customer-1000",
		plan_id: "enterprise",
	},
};

describe("approval card", () => {
	test("leads with the linked action inline", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					...attachArgs.request,
					invoice_mode: { enabled: true, finalize: false },
				},
			},
			preview: wrapMcpResult({
				_display: {
					customerEmail: "billing@key-people.example",
					customerName: "Key People",
					planName: "Enterprise",
				},
				pending: true,
				preview: {
					incoming: [{ plan_id: "enterprise", plan: { name: "Enterprise" } }],
					total: 400,
					currency: "usd",
					next_cycle: { total: 400, starts_at: Date.UTC(2026, 6, 12) },
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(card.title).toBe("Attach plan");
		expect(card.subtitle).toBeUndefined();
		expect(json).toContain(
			"Attaching **<https://app.useautumn.com/sandbox/products/enterprise|Enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|Key People>**",
		);
		expect(json).not.toContain("kp-customer-1000>**?");
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		expect(json).toContain("Next cycle · Jul 12, 2026 — $400.00");
		expect(json).toContain("Draft invoice");
		expect(json).not.toContain("Prorations");
		expect(card.children.at(-2)?.type).toBe("actions");
		expect(json).toContain("approve_billing_action");
		expect(json).toContain("Dismiss");
		expect(json).toContain("Edit details");
		expect(json).toContain(
			"Need a change? Reply in this thread and I’ll refresh the preview.",
		);
		expect(json).not.toContain("set messages to 300");
		expect(json).not.toContain("Attaching **enterprise**");
		expect(json).not.toContain('"request"');
	});

	test("falls back from blank names to customer email and ids", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			preview: {
				_display: {
					customerEmail: "billing@key-people.example",
					customerName: "",
					planName: "",
				},
			},
		});

		expect(JSON.stringify(card)).toContain(
			"products/enterprise|enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|billing@key-people.example>",
		);
	});

	test("escalates live approvals on the button", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Live,
			toolName: "attach",
			toolArgs: attachArgs,
		});

		expect(card.subtitle).toBeUndefined();
		expect(JSON.stringify(card)).toContain("Approve in Live");
		expect(JSON.stringify(card)).toContain(
			"https://app.useautumn.com/customers/kp-customer-1000",
		);
	});

	test("shows a custom base price once in the change table", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "charlie",
					plan_id: "pro",
					customize: { price: { amount: 200, interval: "month" } },
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Update **charlie**'s subscription to **pro**?");
		expect(json).toContain('"caption":"Plan changes"');
		expect(json).toContain('["🟠 Update","Base price","$200.00 per month"]');
		expect(json).not.toContain("custom");
		expect(json).not.toContain('"customize"');
	});

	test("omits badges and money facts when nothing was set", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const types = card.children.map((child) => child.type);
		expect(types).toEqual(["text", "actions", "text"]);
		expect(JSON.stringify(card)).not.toContain("Prorations");
	});

	test("shows negative due-now amounts as a credit", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateSubscription",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "starter" } },
			preview: wrapMcpResult({
				preview: { total: -250.5, currency: "usd" },
			}),
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Credit due now");
		expect(json).toContain("$250.50");
		expect(json).not.toContain("Due now");
		expect(json).not.toContain("-$250.50");
	});

	test("renders schedule phases from absolute and relative API timing", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "createSchedule",
			toolArgs: {
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
							starts_at: "now",
						},
						{
							plans: [
								{
									customize: {
										remove_items: [{ feature_id: "workflows" }],
									},
									plan_id: "enterprise",
								},
							],
							starting_after: { duration_count: 2, duration_type: "year" },
						},
					],
				},
			},
			preview: {
				_display: {
					basePlanItemsByPlan: {
						enterprise: [{ feature_id: "workflows", included: 12 }],
					},
					featureNames: {
						messages: { plural: "messages", singular: "message" },
						workflows: { plural: "workflows", singular: "workflow" },
					},
				},
				currency: "usd",
				incoming: [
					{ plan: { name: "Pro" }, plan_id: "pro" },
					{ plan: { name: "Enterprise" }, plan_id: "enterprise" },
				],
				line_items: [],
				total: 0,
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain('"caption":"Schedule"');
		expect(json).toContain('"headers":["Starts","Plans"]');
		expect(json).toContain('["now","Pro"]');
		expect(json).toContain('["after 2 years","Enterprise"]');
		expect(json).toContain('["🟢 Add","Pro · 100 messages","—"]');
		expect(json).toContain('["🔴 Remove","Enterprise · 12 workflows","—"]');
		expect(json).not.toContain("[object Object]");
	});

	test("renders API defaults and update-only billing controls", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					enable_plan_immediately: false,
					invoice_mode: {
						enabled: true,
						enable_plan_immediately: true,
					},
					plan_id: "pro",
					recalculate_balances: { enabled: true },
				},
			},
			preview: {
				currency: "usd",
				line_items: [],
				redirect_to_checkout: true,
				total: 0,
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Finalized invoice");
		expect(json).toContain("Provision after payment");
		expect(json).toContain("Reset usage");
		expect(json).toContain("Customer completes payment in checkout");
		expect(json).not.toContain("Draft invoice");
	});

	test("offers request details without technical button copy", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const json = JSON.stringify(card);
		expect(json).toContain("view_approval_payload");
		expect(json).toContain("View request");
		expect(json).not.toContain("{} Payload");
	});

	test("renders customized items in a change table", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					...attachArgs.request,
					customize: {
						add_items: [
							{ feature_id: "dashboard" },
							{ feature_id: "seats", unlimited: true },
							{
								feature_id: "messages",
								included: 400,
								price: {
									billing_method: "prepaid",
									billing_units: 50,
									interval: "month",
									tier_behavior: "graduated",
									tiers: [
										{ amount: 3, to: 100 },
										{ amount: 6.7, to: "inf" },
									],
								},
							},
							{
								feature_id: "credits",
								included: 5000,
								price: {
									amount: 0.1,
									interval: "month",
									billing_method: "usage_based",
								},
							},
							{
								feature_id: "api_calls",
								price: {
									amount: 5,
									billing_units: 1000,
									interval: "month",
									billing_method: "usage_based",
								},
							},
						],
						remove_items: [
							{ feature_id: "messages", billing_method: "prepaid" },
							{ feature_id: "credits" },
							{ feature_id: "audit_logs" },
							{ billing_method: "prepaid", interval: "year" },
						],
					},
				},
			},
			preview: {
				_display: {
					basePlanItems: [
						{
							feature_id: "messages",
							included: 200,
							price: {
								amount: 6,
								billing_method: "prepaid",
								billing_units: 100,
								interval: "month",
							},
						},
						{
							feature_id: "credits",
							included: 1000,
							price: { amount: 0.05, billing_method: "usage_based" },
						},
						{ feature_id: "audit_logs", included: 10 },
						{
							feature_id: "annual_tokens",
							included: 50,
							price: { billing_method: "prepaid", interval: "year" },
						},
					],
					featureNames: {
						annual_tokens: {
							plural: "annual tokens",
							singular: "annual token",
						},
						api_calls: { plural: "API calls", singular: "API call" },
						audit_logs: { plural: "audit logs", singular: "audit log" },
						credits: { plural: "credits", singular: "credit" },
						dashboard: { name: "Dashboard" },
						messages: { plural: "messages", singular: "message" },
						seats: { plural: "seats", singular: "seat" },
					},
				},
			},
		});

		const json = JSON.stringify(card);
		const slackJson = JSON.stringify(cardToBlockKit(card));
		expect(json).toContain('"caption":"Plan changes"');
		expect(slackJson).toContain('"type":"data_table"');
		expect(slackJson).toContain('"caption":"Plan changes"');
		expect(json).toContain('"headers":["Change","Details","Pricing"]');
		expect(json).toContain('["🟢 Add","Dashboard","—"]');
		expect(json).toContain('["🟢 Add","Unlimited seats","—"]');
		expect(json).toContain(
			'["🟢 Add","400 messages","≤100: $3.00 / 50; $6.70 / 50 · graduated tiers"]',
		);
		expect(json).toContain('["🟢 Add","5,000 credits","$0.10 / unit"]');
		expect(json).toContain('["🟢 Add","API calls","$5.00 / 1,000"]');
		expect(json).toContain('["🔴 Remove","200 messages","$6.00 / 100"]');
		expect(json).toContain('["🔴 Remove","1,000 credits","$0.05 / unit"]');
		expect(json).toContain('["🔴 Remove","10 audit logs","—"]');
		expect(json).toContain('["🔴 Remove","50 annual tokens","—"]');
		expect(json.indexOf('["🟢 Add","5,000 credits"')).toBeLessThan(
			json.indexOf('["🔴 Remove","10 audit logs"'),
		);
	});

	test("diffs full item replacements against the catalog plan", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					...attachArgs.request,
					customize: {
						items: [
							{ feature_id: "words", included: 5000 },
							{ feature_id: "workflows", included: 40 },
							{ feature_id: "storage", included: 100 },
						],
					},
				},
			},
			preview: {
				_display: {
					basePlanItems: [
						{
							feature_id: "messages",
							included: 800,
							price: { amount: 6, billing_units: 100 },
						},
						{ feature_id: "words", included: 4000 },
						{ feature_id: "workflows", included: 40 },
					],
					featureNames: {
						messages: { plural: "messages", singular: "message" },
						storage: { plural: "gigabytes", singular: "gigabyte" },
						words: { plural: "words", singular: "word" },
						workflows: { plural: "workflows", singular: "workflow" },
					},
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain('["🟢 Add","100 gigabytes","—"]');
		expect(json).toContain('["🟢 Add","5,000 words","—"]');
		expect(json).toContain('["🔴 Remove","4,000 words","—"]');
		expect(json).toContain('["🔴 Remove","800 messages","$6.00 / 100"]');
		expect(json.indexOf('["🟢 Add","100 gigabytes"')).toBeLessThan(
			json.indexOf('["🔴 Remove","4,000 words"'),
		);
		expect(json.indexOf('["🟢 Add","5,000 words"')).toBeLessThan(
			json.indexOf('["🔴 Remove","800 messages"'),
		);
		expect(json).not.toContain("Replace");
		expect(json).not.toContain('["workflows"');
	});

	test("explains checkout instead of naming the link", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: {
				request: { ...attachArgs.request, redirect_mode: "always" },
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Customer completes payment in checkout");
		expect(json).not.toContain('"content":"Checkout link"');
	});

	test("groups catalog resources and plan changes into separate tables", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateCatalog",
			toolArgs: {
				request: {
					plans: [{ plan_id: "growth_seed", items: [] }],
					skip_deletions: true,
				},
			},
			preview: {
				plan_changes: [
					{
						action: "updated",
						customize: {
							add_items: [{ feature_id: "dashboard" }],
						},
						item_changes: [
							{
								action: "created",
								feature_id: "dashboard",
								item: {
									display: { primary_text: "Dashboard" },
								},
							},
							{
								action: "created",
								feature_id: "messages",
								item: {
									display: { primary_text: "100 Messages" },
									included: 100,
									price: { amount: 6, billing_units: 100 },
								},
							},
						],
						plan: { name: "Growth seed" },
						plan_id: "growth_seed",
					},
				],
				feature_changes: [
					{
						action: "update",
						blocked: false,
						feature: { name: "Messages" },
						feature_id: "messages",
						will_archive: false,
					},
					{
						action: "skipped",
						blocked: true,
						feature_id: "locked_feature",
						will_archive: false,
					},
				],
				reward_changes: [{ action: "created", id: "launch" }],
				referral_program_changes: [{ action: "deleted", id: "old-referral" }],
			},
		});

		const json = JSON.stringify(card);
		const slackBlocks = cardToBlockKit(card);
		expect(json).toContain('"caption":"Catalog changes"');
		expect(json).toContain('"caption":"Plan changes"');
		expect(
			slackBlocks.filter(
				(block) => block.type === "data_table" || block.type === "table",
			),
		).toHaveLength(2);
		expect(JSON.stringify(slackBlocks)).not.toContain("```");
		expect(json.indexOf('"caption":"Catalog changes"')).toBeLessThan(
			json.indexOf('"caption":"Plan changes"'),
		);
		expect(json).not.toContain('"content":"Update catalog?"');
		expect(json).toContain('"headers":["Change","Details","Pricing"]');
		expect(json).toContain('["🟢 Add","Dashboard","—"]');
		expect(json).toContain('["🟢 Add","100 Messages","$6.00 / 100"]');
		expect(json).toContain('["🟢 Add","launch","—"]');
		expect(json).not.toContain('["🟠 Update","Growth seed","—"]');
		expect(json).toContain('["🟠 Update","Messages","—"]');
		expect(json).toContain('["🔴 Remove","old-referral","—"]');
		expect(json).toContain('["⚠️ Blocked","locked_feature","—"]');
		expect(json).not.toContain("Skip deletions");
		expect(json).not.toContain('"plans"');
	});

	test.each([
		["createPlan", "Plan changes"],
		["createReward", "Catalog changes"],
		["updatePlan", "Plan changes"],
	])("uses the right change scope for %s approvals", (toolName, caption) => {
		const card = approvalCard({
			id: "approval_1",
			toolName,
			toolArgs: { request: { name: "Growth", plan_id: "growth" } },
			preview: {
				feature_changes: [],
				plan_changes: [
					{
						action: toolName === "createPlan" ? "created" : "updated",
						item_changes: [],
						plan: { name: "Growth" },
						plan_id: "growth",
					},
				],
				reward_changes:
					toolName === "createReward"
						? [{ action: "created", id: "launch" }]
						: [],
				referral_program_changes: [],
			},
		});

		expect(JSON.stringify(card)).toContain(`"caption":"${caption}"`);
	});

	test("uses the plan name for a single-plan catalog update", () => {
		const preview = {
			_display: {
				featureNames: { footballs: { name: "Footballs" } },
				planNames: { growth_seed: "Growth seed" },
			},
			preview: {
				feature_changes: [],
				plan_changes: [
					{
						action: "updated",
						item_changes: [
							{
								action: "created",
								feature_id: "footballs",
								item: {
									display: { primary_text: "$100 per football" },
									included: 0,
									price: { amount: 100 },
								},
							},
						],
						plan_id: "growth_seed",
					},
				],
				reward_changes: [],
				referral_program_changes: [],
			},
		};
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateCatalog",
			preview,
		});
		const updated = approvalStatusCard({
			preview,
			status: "superseded",
			toolName: "updateCatalog",
		});

		const json = JSON.stringify(card);
		expect(card.title).toBe("Update Growth seed");
		expect(updated.title).toBe("Update Growth seed");
		expect(json).toContain('"caption":"Plan changes"');
		expect(json).toContain('["🟢 Add","Footballs","$100.00 / unit"]');
		expect(json).not.toContain("$100 per football");
		expect(JSON.stringify(updated)).toContain('"caption":"Plan changes"');
		expect(json).not.toContain("Update catalog");
	});

	test("renders non-preview customer writes as readable fields", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "updateCustomer",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					email: "billing@example.com",
					name: "Acme",
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Update **Acme**?");
		expect(json).toContain('"label":"Name","value":"Acme"');
		expect(json).toContain('"label":"Email","value":"billing@example.com"');
		expect(json).not.toContain('"customer_id"');
	});

	test("omits the changes block when nothing is customized", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const json = JSON.stringify(card);
		expect(json).not.toContain("Plan changes");
		expect(card.children.some((child) => child.type === "divider")).toBe(false);
	});
});

describe("approval payload modal", () => {
	test("renders only the request body as a code block", () => {
		const modal = approvalPayloadModal({
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				intent: "Attach the scale yearly plan.",
				request: attachArgs.request,
			},
		});

		const json = JSON.stringify(modal);
		expect(modal.title).toBe("Request details");
		expect(json).toContain("kp-customer-1000");
		expect(json).toContain("```");
		expect(json).toContain("Attach request body targeting sandbox environment");
		expect(json).not.toContain("intent");
	});

	test("truncates oversized payloads", () => {
		const modal = approvalPayloadModal({
			toolName: "attach",
			toolArgs: { request: { blob: "x".repeat(5000) } },
		});

		expect(JSON.stringify(modal)).toContain("(truncated)");
	});
});

describe("approval details modal", () => {
	test("prefills editable billing settings", () => {
		const modal = approvalDetailsModal({
			approvalId: "approval_1",
			toolArgs: {
				request: {
					...attachArgs.request,
					enable_plan_immediately: true,
					invoice_mode: { enabled: true, finalize: false },
				},
			},
		});

		const json = JSON.stringify(modal);
		expect(modal.title).toBe("Edit billing details");
		expect(modal.privateMetadata).toBe("approval_1");
		expect(json).toContain('"initialOption":"draft"');
		expect(json).toContain('"initialOption":"if_required"');
		expect(json).toContain('"initialOption":"immediate"');
		expect(json).toContain("Create draft invoice");
		expect(json).toContain("Provision after payment");
		expect(json).toContain("If required");
		expect(json).toContain("Always");
		expect(json).toContain("Update preview");
	});

	test("prefills invoice and redirect API defaults", () => {
		const modal = approvalDetailsModal({
			approvalId: "approval_1",
			toolArgs: {
				request: {
					...attachArgs.request,
					invoice_mode: { enabled: true },
				},
			},
		});

		const json = JSON.stringify(modal);
		expect(json).toContain('"initialOption":"finalized"');
		expect(json).toContain('"initialOption":"if_required"');
		expect(json).toContain('"initialOption":"after_payment"');
	});
});

describe("approval status card", () => {
	test("shows no progress line until the action reports progress", () => {
		const card = approvalStatusCard({
			status: "running",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			actorId: "U1",
			preview: wrapMcpResult({
				preview: { total: 400, currency: "usd" },
			}),
		});

		const json = JSON.stringify(card);
		expect(card.title).toBe("Attach plan");
		expect(card.subtitle).toBeUndefined();
		expect(json).toContain(
			"Attaching **<https://app.useautumn.com/sandbox/products/enterprise|enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**…",
		);
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		// No misleading placeholder — the running "…" sentence carries the state.
		expect(json).not.toContain("▸");
		expect(json).not.toContain("Confirming with Stripe");
		expect(json).not.toContain("⏳");
		expect(json).not.toContain("approve_billing_action");
	});

	test("shows a live status line while running", () => {
		const card = approvalStatusCard({
			status: "running",
			toolName: "attach",
			toolArgs: attachArgs,
			actorId: "U1",
			statusLine: "Creating invoice… · 24s",
		});

		expect(JSON.stringify(card)).toContain("▸ Creating invoice… · 24s");
	});

	test("renders the outcome as the headline with invoice facts and links", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			actorId: "U1",
			result: {
				result: wrapMcpResult({
					customer_id: "kp-customer-1000",
					invoice: {
						status: "draft",
						total: 0,
						currency: "usd",
						stripe_id: "in_123",
						hosted_invoice_url: "https://invoice.example",
					},
					payment_url: "https://pay.example",
				}),
				text: "",
				toolName: "attach",
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain(
			"✅ Attached **<https://app.useautumn.com/sandbox/products/enterprise|enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**",
		);
		expect(json).toContain("Draft invoice — $0.00");
		// Drafts link to the dashboard — the hosted page is not payable yet.
		expect(json).toContain("Open draft in Stripe");
		expect(json).toContain("https://dashboard.stripe.com/test/invoices/in_123");
		expect(json).toContain("Open checkout");
		expect(json).toContain("https://pay.example");
		expect(json).not.toContain("View customer");
		expect(json).not.toContain("approved by");
	});

	test("keeps the pending card footprint after approval", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			actorId: "U1",
			preview: wrapMcpResult({
				preview: { total: 400, currency: "usd" },
			}),
			result: { result: wrapMcpResult({ customer_id: "kp-customer-1000" }) },
		});

		const json = JSON.stringify(card);
		// Title and money facts survive the edit-in-place instead of collapsing.
		expect(card.title).toBe("Attach plan");
		expect(json).toContain(
			"✅ Attached **<https://app.useautumn.com/sandbox/products/enterprise|enterprise>**",
		);
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		expect(card.subtitle).toBeUndefined();
	});

	test("falls back to a customer button when the sentence has no customer", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Sandbox,
			toolName: "attach",
			result: {
				result: wrapMcpResult({
					customer_id: "cus_from_result",
				}),
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("View customer");
		expect(json).toContain(
			"https://app.useautumn.com/sandbox/customers/cus_from_result",
		);
	});

	test("links the hosted invoice page for finalized invoices", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Live,
			toolName: "attach",
			result: {
				result: {
					invoice: {
						status: "open",
						stripe_id: "in_live",
						hosted_invoice_url: "https://invoice.example/open",
					},
					payment_url: "https://invoice.example/open",
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain("View invoice");
		expect(json).toContain("https://invoice.example/open");
		// payment_url mirrors the hosted URL for open invoices — one link only.
		expect(json).not.toContain("Open checkout");
	});

	test("falls back to the Stripe dashboard invoice link per environment", () => {
		const sandbox = approvalStatusCard({
			status: "approved",
			env: AppEnv.Sandbox,
			toolName: "attach",
			result: {
				result: {
					invoice: {
						status: "draft",
						stripe_id: "in_123",
						hosted_invoice_url: null,
					},
				},
			},
		});
		const live = approvalStatusCard({
			status: "approved",
			env: AppEnv.Live,
			toolName: "attach",
			result: {
				result: {
					invoice: { stripe_id: "in_live", hosted_invoice_url: null },
				},
			},
		});

		expect(JSON.stringify(sandbox)).toContain(
			"https://dashboard.stripe.com/test/invoices/in_123",
		);
		expect(JSON.stringify(live)).toContain(
			"https://dashboard.stripe.com/invoices/in_live",
		);
		expect(JSON.stringify(live)).not.toContain("/test/invoices/in_live");
	});

	test("explains required payment actions in human terms", () => {
		const card = approvalStatusCard({
			status: "approved",
			env: AppEnv.Live,
			toolName: "attach",
			toolArgs: attachArgs,
			result: {
				result: {
					customer_id: "kp-customer-1000",
					required_action: {
						code: "payment_method_required",
						reason: "Customer has no card on file.",
					},
					payment_url: "https://pay.example/setup",
				},
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain(
			"Customer needs a payment method on file — Customer has no card on file.",
		);
		expect(json).toContain("Open checkout");
		expect(json).not.toContain("payment_method_required");
	});

	test("renders failures with the error message and no raw fields", () => {
		const card = approvalStatusCard({
			status: "failed",
			toolName: "attach",
			toolArgs: attachArgs,
			result: {
				error: true,
				message: "Missing email.",
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain(
			"⚠️ Couldn't attach **enterprise** to **kp-customer-1000**",
		);
		expect(json).toContain("Missing email.");
		expect(json).not.toContain('"error"');
	});

	test("keeps dismissals in the approval-card footprint", () => {
		const card = approvalStatusCard({
			status: "cancelled",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			actorId: "U2",
			preview: wrapMcpResult({
				preview: {
					total: 400,
					currency: "usd",
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(card.title).toBe("Attach plan");
		expect(card.subtitle).toBeUndefined();
		expect(json).toContain(
			"Attach **<https://app.useautumn.com/sandbox/products/enterprise|enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**?",
		);
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		expect(json).toContain("Dismissed by <@U2>");
		// Settled state is a non-interactive status line, not a (fake) button row.
		expect(card.children.at(-1)?.type).toBe("text");
		expect(json).not.toContain('"type":"actions"');
		expect(json).not.toContain("approve_billing_action");
		expect(json).not.toContain("cancel_billing_action");
		expect(json).not.toContain("view_approval_payload");
	});

	test("explains superseded and expired approvals", () => {
		const superseded = approvalStatusCard({
			status: "superseded",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			preview: wrapMcpResult({
				preview: {
					total: 400,
					currency: "usd",
				},
			}),
		});
		const expired = approvalStatusCard({
			status: "expired",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const supersededJson = JSON.stringify(superseded);
		expect(superseded.title).toBe("Attach plan");
		expect(superseded.subtitle).toBeUndefined();
		expect(supersededJson).toContain(
			"Attach **<https://app.useautumn.com/sandbox/products/enterprise|enterprise>** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**?",
		);
		expect(supersededJson).toContain("Due now");
		expect(supersededJson).toContain("$400.00");
		expect(supersededJson).toContain("🔄 Updated");
		// Settled state is a non-interactive status line, not a (fake) button row.
		expect(superseded.children.at(-1)?.type).toBe("text");
		expect(supersededJson).not.toContain('"type":"actions"');
		expect(supersededJson).not.toContain("approve_billing_action");
		expect(supersededJson).not.toContain("cancel_billing_action");
		expect(supersededJson).not.toContain("view_approval_payload");
		expect(JSON.stringify(expired)).not.toContain("🧪 Sandbox");
		expect(JSON.stringify(expired)).toContain("expired");
	});

	test("keeps a sane fallback for unknown tools and empty results", () => {
		const card = approvalStatusCard({
			status: "approved",
			toolName: "configureWebhooks",
			result: {},
		});

		expect(JSON.stringify(card)).toContain("✅ Configure Webhooks completed");
	});
});

// A write the model asked for but Eve withheld is invisible unless the card
// names it, which is how half a multi-write request used to go missing.
describe("withheld writes", () => {
	test("names the other requested writes on the pending card", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: { customer_id: "cus_1", plan_id: "pro" },
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "cus_1", email: "new@x.com" } },
						requestId: "req_2",
						toolName: "autumn__updateCustomer",
					},
				],
			},
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		// The grouped write renders as a real action line, not a bolted-on table.
		expect(rendered).toContain("Updating");
		expect(rendered).toContain("new@x.com");
	});

	test("says nothing when no writes were withheld", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: { request: { customer_id: "cus_1", plan_id: "pro" } },
		});

		// One write means one action line, not a second grouped step.
		const sections = cardToBlockKit(card).filter(
			(block) => (block as { type: string }).type === "section",
		);
		expect(sections).toHaveLength(1);
	});
});

// A grouped card that half-applied must name which write landed; a single
// failed write is already described by its message.
describe("grouped step outcomes", () => {
	test("breaks down a partly applied group", () => {
		const card = approvalStatusCard({
			env: AppEnv.Sandbox,
			status: "failed",
			steps: [
				{ status: "applied", toolName: "updateCustomer" },
				{ status: "failed", toolName: "attach" },
			],
			toolArgs: { request: { customer_id: "cus_1" } },
			toolName: "updateCustomer",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("Steps");
		expect(rendered).toContain("🟢 Applied");
		expect(rendered).toContain("🔴 Failed");
	});

	test("omits the breakdown for a single failed write", () => {
		const card = approvalStatusCard({
			env: AppEnv.Sandbox,
			status: "failed",
			steps: [{ status: "failed", toolName: "attach" }],
			toolArgs: { request: { customer_id: "cus_1" } },
			toolName: "attach",
		});

		expect(JSON.stringify(cardToBlockKit(card))).not.toContain("Steps");
	});
});

// On a grouped card the primary write may be the one with no preview, so the
// money facts must still reach the user via the included steps.
describe("grouped card with a preview-less primary write", () => {
	test("still names the attach that carries the billing impact", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "updateCustomer",
			toolArgs: {
				request: { customer_id: "cus_1", email: "new@x.com" },
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "cus_1", plan_id: "pro" } },
						requestId: "req_2",
						toolName: "autumn__attach",
					},
				],
			},
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		// Each grouped step carries the heading it would have as its own card.
		expect(rendered).toContain("Attach plan");
		expect(rendered).toContain("Attaching");
		expect(rendered).toContain("Approve");
	});
});

// Attaching one plan to many customers is one operation with many targets, so
// it collapses into a table instead of repeating the same section per customer.
describe("homogeneous fan-out", () => {
	const attachStep = (customerId: string) => ({
		input: { request: { customer_id: customerId, plan_id: "launch" } },
		preview: wrapMcpResult({
			_display: { customerName: customerId, planName: "Launch" },
			currency: "usd",
			line_items: [],
			total: 300,
		}),
		requestId: `req_${customerId}`,
		toolName: "autumn__attach",
	});

	const fanOutCard = (customerIds: string[]) =>
		approvalCard({
			id: "fanout",
			env: AppEnv.Sandbox,
			preview: wrapMcpResult({
				_display: { customerName: "leaf-0001", planName: "Launch" },
				currency: "usd",
				line_items: [],
				total: 300,
			}),
			toolArgs: {
				_eveWithheldWrites: customerIds.map(attachStep),
				request: { customer_id: "leaf-0001", plan_id: "launch" },
			},
			toolName: "attach",
		});

	test("collapses repeated attaches into one table", () => {
		const blocks = cardToBlockKit(
			fanOutCard(["leaf-0002", "leaf-0003", "leaf-0004"]),
		);
		const rendered = JSON.stringify(blocks);

		expect(rendered).toContain("leaf-0004");
		// One heading, not one per customer.
		expect(rendered.split("Attach plan").length - 1).toBe(1);
		expect(blocks.length).toBeLessThan(10);
		// Table cells render raw text, so link markup would show as literal "**".
		expect(rendered).not.toContain("**");
	});

	test("shows the combined total across the fan-out", () => {
		const rendered = JSON.stringify(
			cardToBlockKit(fanOutCard(["leaf-0002", "leaf-0003", "leaf-0004"])),
		);

		expect(rendered).toContain("1,200");
	});

	test("keeps per-step sections when the writes differ", () => {
		const card = approvalCard({
			id: "mixed",
			env: AppEnv.Sandbox,
			toolArgs: {
				_eveWithheldWrites: [attachStep("leaf-0002")],
				request: { customer_id: "leaf-0001", email: "new@x.com" },
			},
			toolName: "updateCustomer",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("Update customer");
		expect(rendered).toContain("Attach plan");
	});
});

// A grouped card approves several writes, so the request modal must show each
// one — the reviewer is signing off on all of them, not just the first.
describe("request modal for grouped writes", () => {
	const modal = approvalPayloadModal({
		env: AppEnv.Sandbox,
		toolArgs: {
			_eveWithheldWrites: [
				{
					input: { request: { customer_id: "leaf-0002", plan_id: "scale" } },
					requestId: "req_2",
					toolName: "autumn__attach",
				},
				{
					input: { request: { customer_id: "leaf-0003", plan_id: "scale" } },
					requestId: "req_3",
					toolName: "autumn__attach",
				},
			],
			request: { customer_id: "leaf-0001", plan_id: "scale" },
		},
		toolName: "attach",
	});
	const rendered = JSON.stringify(modal);

	test("shows every write's request body", () => {
		expect(rendered).toContain("leaf-0001");
		expect(rendered).toContain("leaf-0002");
		expect(rendered).toContain("leaf-0003");
	});

	test("labels each write so the reviewer can tell them apart", () => {
		expect(rendered).toContain("1 of 3");
		expect(rendered).toContain("3 of 3");
	});

	test("a single write keeps the plain label", () => {
		const single = JSON.stringify(
			approvalPayloadModal({
				env: AppEnv.Sandbox,
				toolArgs: { request: { customer_id: "leaf-0001", plan_id: "scale" } },
				toolName: "attach",
			}),
		);
		expect(single).toContain("Attach request body");
		expect(single).not.toContain("1 of");
	});
});

// The per-step preview is the {_display, preview} envelope; the money lives on
// the inner preview, not the wrapper.
describe("fan-out reads money from the wrapped preview", () => {
	const wrapped = (total: number) => ({
		_display: { customerName: "Acme", planName: "Scale" },
		preview: {
			currency: "usd",
			line_items: [
				{ subtotal: 0, total: 0 },
				{ subtotal: total, total },
			],
			subtotal: total,
			total,
		},
	});

	test("shows the customized amount per row and in the total", () => {
		const card = approvalCard({
			id: "fanout",
			env: AppEnv.Sandbox,
			preview: wrapped(1000),
			toolArgs: {
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "leaf-0002", plan_id: "scale" } },
						preview: wrapped(1000),
						requestId: "req_2",
						toolName: "autumn__attach",
					},
					{
						input: { request: { customer_id: "leaf-0003", plan_id: "scale" } },
						preview: wrapped(0),
						requestId: "req_3",
						toolName: "autumn__attach",
					},
				],
				request: {
					customer_id: "leaf-0001",
					customize: { price: { amount: 1000, interval: "month" } },
					plan_id: "scale",
				},
			},
			toolName: "attach",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("$1,000.00");
		expect(rendered).toContain("$2,000.00");
	});
});

// A backfilled step preview arrives as the raw MCP envelope; the money is a
// JSON string inside content[].text and must still reach the table.
describe("fan-out reads money from a raw MCP preview envelope", () => {
	const mcpEnvelope = (total: number) => ({
		_display: { customerName: "Acme", planName: "Scale" },
		preview: wrapMcpResult({
			currency: "usd",
			line_items: [{ subtotal: total, total }],
			subtotal: total,
			total,
		}),
	});

	test("shows the amount per row instead of $0.00", () => {
		const card = approvalCard({
			id: "fanout",
			env: AppEnv.Sandbox,
			preview: mcpEnvelope(1000),
			toolArgs: {
				_eveWithheldWrites: [
					{
						input: { request: { customer_id: "leaf-0002", plan_id: "scale" } },
						preview: mcpEnvelope(500),
						requestId: "req_2",
						toolName: "autumn__attach",
					},
					{
						input: { request: { customer_id: "leaf-0003", plan_id: "scale" } },
						preview: mcpEnvelope(500),
						requestId: "req_3",
						toolName: "autumn__attach",
					},
				],
				request: { customer_id: "leaf-0001", plan_id: "scale" },
			},
			toolName: "attach",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("$1,000.00");
		expect(rendered).toContain("$500.00");
		expect(rendered).toContain("$2,000.00");
		expect(rendered).not.toContain("$0.00");
	});
});
