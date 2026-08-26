import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";

process.env.AUTUMN_DASHBOARD_URL = "https://app.useautumn.com";

import { cardToBlockKit } from "@chat-adapter/slack";
import {
	approvalCard,
	approvalDetailsModal,
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

	// A replaced base plan must be visible without joining the diff table.
	test("attach folds the replaced plan into the headline", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: { request: attachArgs.request },
			preview: wrapMcpResult({
				preview: {
					currency: "usd",
					incoming: [{ plan_id: "scale", plan: { name: "Scale" } }],
					outgoing: [{ plan_id: "launch", plan: { name: "Launch" } }],
					total: 500,
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(json).toContain(
			"and removing **<https://app.useautumn.com/sandbox/products/launch|Launch>**",
		);
	});

	test("an in-place plan update is not shown as a removal", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: { request: attachArgs.request },
			preview: wrapMcpResult({
				preview: {
					currency: "usd",
					incoming: [{ plan_id: "scale", plan: { name: "Scale" } }],
					outgoing: [{ plan_id: "scale", plan: { name: "Scale" } }],
					total: 0,
				},
			}),
		});

		expect(JSON.stringify(card)).not.toContain("and removing");
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
		expect(json).toContain('"caption":"pro customizations"');
		// No current plan in the preview, so setting a price is an add.
		expect(json).toContain('["🟢 Add","Base price","$200.00 per month"]');
		expect(json).not.toContain('Update","Base price');
		expect(json).not.toContain("Custom plan");
		expect(json).not.toContain('"customize"');
	});

	// Changing the base price is a remove of the old and an add of the new —
	// the same diff the dashboard renders, never a hardcoded "Update".
	test("shows a base price change as a remove and an add", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					customize: { price: { amount: 200, interval: "month" } },
					plan_id: "pro",
				},
			},
			preview: wrapMcpResult({
				_display: {
					currentPlan: { price: { amount: 150, interval: "month" } },
					customerName: "charlie",
					planName: "pro",
				},
				preview: { currency: "usd", line_items: [], total: 50 },
			}),
		});
		const json = JSON.stringify(card);
		expect(json).toContain('["🔴 Remove","Base price","$150.00 per month"]');
		expect(json).toContain('["🟢 Add","Base price","$200.00 per month"]');
		expect(json).not.toContain("🟠 Update");
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
		expect(json).toContain(
			'["🔴 Remove","Enterprise (after 2 years) · 12 workflows","—"]',
		);
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
		expect(json).toContain("Usage will reset");
		expect(json).toContain("Customer completes payment in checkout");
		expect(json).not.toContain("Draft invoice");
	});

	test("keeps the card actions to approve, dismiss, and edit", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const json = JSON.stringify(card);
		expect(json).toContain("approve_billing_action");
		expect(json).toContain("cancel_billing_action");
		expect(json).not.toContain("view_approval_payload");
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
		expect(json).toContain('"caption":"enterprise customizations"');
		expect(slackJson).toContain('"type":"data_table"');
		expect(slackJson).toContain('"caption":"enterprise customizations"');
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
		// A diff reads old → new: what the customer loses before what they gain.
		expect(json.indexOf('["🔴 Remove","10 audit logs"')).toBeLessThan(
			json.indexOf('["🟢 Add","5,000 credits"'),
		);
	});

	// The prepaid quantity is the money decision: it belongs on the item's own
	// row with its line total, not in a detached "Quantities" footnote.
	test("shows a prepaid add with its quantity and line total on the row", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					plan_id: "enterprise",
					customize: {
						add_items: [
							{
								feature_id: "project_slots",
								price: {
									amount: 10,
									billing_method: "prepaid",
									billing_units: 1,
									interval: "month",
								},
							},
						],
						remove_items: [{ feature_id: "project_slots" }],
					},
					feature_quantities: [{ feature_id: "project_slots", quantity: 100 }],
				},
			},
			preview: {
				_display: {
					currentPlan: {
						items: [{ feature_id: "project_slots", included: 200 }],
					},
					featureNames: {
						project_slots: {
							plural: "Project Slots",
							singular: "Project Slot",
						},
					},
				},
				currency: "usd",
				incoming: [{ plan_id: "enterprise" }],
				total: 0,
			},
		});

		const json = JSON.stringify(card);
		expect(json).toContain('["🔴 Remove","200 Project Slots","—"]');
		expect(json).toContain(
			'["🟢 Add","100 Project Slots (prepaid)","$10.00 / unit"]',
		);
		expect(json).not.toContain("Quantities");
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
		expect(json.indexOf('["🔴 Remove","4,000 words"')).toBeLessThan(
			json.indexOf('["🟢 Add","100 gigabytes"'),
		);
		expect(json.indexOf('["🔴 Remove","800 messages"')).toBeLessThan(
			json.indexOf('["🟢 Add","5,000 words"'),
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

describe("approval details modal", () => {
	test("prefills the billing mode and provisioning", () => {
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
		expect(json).toContain('"initialOption":"draft_invoice"');
		expect(json).toContain('"initialOption":"immediate"');
		expect(json).toContain("Checkout link");
		expect(json).toContain("Draft invoice");
		expect(json).toContain("Finalized invoice");
		expect(json).toContain("Provision after payment");
		expect(json).toContain("Update preview");
		expect(json).not.toContain('"id":"redirect"');
	});

	test("reads a checkout request and finalized-invoice defaults", () => {
		const checkout = JSON.stringify(
			approvalDetailsModal({
				approvalId: "approval_1",
				toolArgs: {
					request: { ...attachArgs.request, redirect_mode: "always" },
				},
			}),
		);
		expect(checkout).toContain('"initialOption":"checkout"');
		expect(checkout).toContain('"initialOption":"after_payment"');

		const finalized = JSON.stringify(
			approvalDetailsModal({
				approvalId: "approval_1",
				toolArgs: {
					request: { ...attachArgs.request, invoice_mode: { enabled: true } },
				},
			}),
		);
		expect(finalized).toContain('"initialOption":"finalized_invoice"');
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
		expect(supersededJson).toContain(
			"🔄 Withdrawn — superseded by a newer request in this thread",
		);
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
			outcomes: [
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
			outcomes: [{ status: "failed", toolName: "attach" }],
			toolArgs: { request: { customer_id: "cus_1" } },
			toolName: "attach",
		});

		expect(JSON.stringify(cardToBlockKit(card))).not.toContain("Steps");
	});
});

// On a grouped card the primary write may be the one with no preview, so the
// money facts must still reach the user via the included writes.
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

	test("non-billing fan-outs show each write's fields instead of money", () => {
		const updateStep = (email: string, id: string) => ({
			input: { request: { customer_id: email, id } },
			requestId: `req_${email}`,
			toolName: "autumn__updateCustomer",
		});
		const card = approvalCard({
			id: "fanout-update",
			env: AppEnv.Sandbox,
			toolArgs: {
				_eveWithheldWrites: [
					updateStep("ilvernon32@gmail.com", "user_beta"),
					updateStep("greaterinvestments@gmail.com", "user_gamma"),
				],
				request: {
					customer_id: "cassidy2flawless@yahoo.com",
					id: "user_alpha",
				},
			},
			toolName: "updateCustomer",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("Update");
		expect(rendered).toContain("Id: user_alpha");
		expect(rendered).toContain("Id: user_beta");
		expect(rendered).toContain("Id: user_gamma");
		expect(rendered).not.toContain("Due now");
		expect(rendered).not.toContain("Total");
		expect(rendered).not.toContain("$0.00");
	});

	test("fan-out rows render every field kind: sets, clears, objects, overflow", () => {
		const card = approvalCard({
			id: "fanout-fields",
			env: AppEnv.Sandbox,
			toolArgs: {
				_eveWithheldWrites: [
					{
						input: {
							request: { customer_id: "b@x.com", email: null, name: "Beta" },
						},
						requestId: "req_b",
						toolName: "autumn__updateCustomer",
					},
					{
						input: {
							request: { customer_id: "c@x.com", id: "user_gamma" },
						},
						requestId: "req_c",
						toolName: "autumn__updateCustomer",
					},
				],
				request: {
					customer_id: "a@x.com",
					email: "new@x.com",
					fingerprint: "fp_1",
					id: "user_alpha",
					metadata: { source: "revenuecat" },
					name: "Alpha",
					stripe_id: "cus_stripe1",
					tax_exempt: true,
				},
			},
			toolName: "updateCustomer",
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("Email: new@x.com");
		expect(rendered).toContain("Id: user_alpha");
		expect(rendered).toContain("Metadata: {");
		expect(rendered).toContain("revenuecat");
		expect(rendered).toContain("+1 more");
		expect(rendered).toContain("Email: cleared");
		expect(rendered).toContain("Name: Beta");
	});

	test("a completed id change links the new customer id, pending links the old", () => {
		const toolArgs = {
			request: { customer_id: "edge-mt33ohxl", id: "user_fresh" },
		};
		const pending = JSON.stringify(
			cardToBlockKit(
				approvalCard({
					id: "rename-pending",
					env: AppEnv.Sandbox,
					toolArgs,
					toolName: "updateCustomer",
				}),
			),
		);
		expect(pending).toContain("customers/edge-mt33ohxl");

		const done = JSON.stringify(
			cardToBlockKit(
				approvalStatusCard({
					env: AppEnv.Sandbox,
					status: "approved",
					toolArgs,
					toolName: "updateCustomer",
				}),
			),
		);
		expect(done).toContain("customers/user_fresh");
		expect(done).not.toContain("customers/edge-mt33ohxl");
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

// A "Plan changes" table already says the plan is being updated, so the generic
// intent label above it is noise; a cancel has no table and keeps its label.
describe("update-subscription card avoids restating itself", () => {
	const updateWithChanges = () =>
		approvalCard({
			id: "u1",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					customize: { price: { amount: 150, interval: "month" } },
					plan_id: "automation_pack",
				},
			},
			preview: wrapMcpResult({
				currency: "usd",
				customer_id: "cus_1",
				intent: "update_plan",
				line_items: [],
				total: 0,
				updated: [
					{
						plan_id: "automation_pack",
						plan: { name: "Automation Pack" },
						changes: { base_price: { from: 100, to: 150 } },
					},
				],
			}),
		});

	test("drops the generic intent label when a changes table renders", () => {
		const rendered = JSON.stringify(cardToBlockKit(updateWithChanges()));
		expect(rendered).toContain("customizations");
		expect(rendered).not.toContain('"Update plan"');
	});

	test("keeps a cancel label since no table describes it", () => {
		const card = approvalCard({
			id: "u2",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					cancel_action: "cancel_immediately",
					customer_id: "cus_1",
					plan_id: "enterprise",
				},
			},
			preview: wrapMcpResult({
				currency: "usd",
				customer_id: "cus_1",
				intent: "cancel_immediately",
				line_items: [],
				total: 0,
			}),
		});
		expect(JSON.stringify(cardToBlockKit(card))).toContain(
			"Cancel immediately",
		);
	});
});

// "No billing changes" already explains why nothing is due; a second "No charge
// now" line beneath it says the same thing twice.
describe("no-billing-changes card does not also say no charge", () => {
	test("omits the no-charge line when the badge carries the reason", () => {
		const card = approvalCard({
			id: "u3",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					no_billing_changes: true,
					plan_id: "enterprise",
				},
			},
			preview: wrapMcpResult({
				currency: "usd",
				customer_id: "cus_1",
				line_items: [],
				total: 0,
			}),
		});
		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("No billing changes");
		expect(rendered).not.toContain("No charge now");
	});
});

// The resolved card must keep showing every write the group applied — it is
// an in-place edit of the pending card, so collapsing to one write misreports
// what was approved.
describe("resolved fan-out card keeps the whole group", () => {
	const groupedFanOut = {
		env: AppEnv.Sandbox,
		toolArgs: {
			_eveWithheldWrites: ["leaf-0002", "leaf-0003"].map((customerId) => ({
				input: { request: { customer_id: customerId, plan_id: "enterprise" } },
				preview: wrapMcpResult({
					_display: { customerName: customerId, planName: "Enterprise" },
					currency: "usd",
					line_items: [],
					total: 150,
				}),
				requestId: `req_${customerId}`,
				toolName: "autumn__attach",
			})),
			request: { customer_id: "leaf-0001", plan_id: "enterprise" },
		},
		toolName: "attach",
		preview: wrapMcpResult({
			_display: { customerName: "leaf-0001", planName: "Enterprise" },
			currency: "usd",
			line_items: [],
			total: 150,
		}),
	};

	// Every state edits the same Slack message, so each must describe the
	// same set of writes.
	test.each(["running", "approved", "cancelled"] as const)(
		"keeps every customer on the %s card",
		(status) => {
			const rendered = JSON.stringify(
				cardToBlockKit(approvalStatusCard({ ...groupedFanOut, status })),
			);
			expect(rendered).toContain("leaf-0001");
			expect(rendered).toContain("leaf-0002");
			expect(rendered).toContain("leaf-0003");
			expect(rendered).toContain("$450.00");
		},
	);
});

// A grouped step must speak in the card's tense: "Attached" once resolved, not
// a permanent "Attaching" that reads as still pending.
describe("grouped writes follow the card state", () => {
	const mixedGroup = {
		env: AppEnv.Sandbox,
		toolArgs: {
			_eveWithheldWrites: [
				{
					input: {
						request: { customer_id: "leaf-0001", plan_id: "automation_pack" },
					},
					requestId: "req_2",
					toolName: "autumn__attach",
				},
			],
			request: { customer_id: "leaf-0001", email: "new@x.com" },
		},
		toolName: "updateCustomer",
	};

	test("resolved card says the grouped attach was done", () => {
		const rendered = JSON.stringify(
			cardToBlockKit(approvalStatusCard({ ...mixedGroup, status: "approved" })),
		);
		expect(rendered).toContain("Attached");
		expect(rendered).not.toContain("Attaching");
	});

	test("pending card still says the grouped attach is coming", () => {
		const rendered = JSON.stringify(
			cardToBlockKit(approvalCard({ ...mixedGroup, id: "p1" })),
		);
		expect(rendered).toContain("Attaching");
	});
});

// A remove_items filter names a feature, not a quantity. The quantity being
// removed is whatever the customer CURRENTLY has, which can differ from the
// catalog plan — showing the catalog's included count (often 0) is wrong.
describe("remove rows show the customer's current quantity", () => {
	test("removes 250,000 contacts the customer has, not the catalog's 0", () => {
		const card = approvalCard({
			id: "u1",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_atlas",
					customize: {
						add_items: [{ feature_id: "contacts", included: 500_000 }],
						remove_items: [{ feature_id: "contacts" }],
					},
					plan_id: "enterprise",
				},
			},
			preview: wrapMcpResult({
				_display: {
					// resolveApprovalDisplay already prefers the customer's live
					// subscription items over the catalog's; the card must render
					// that quantity rather than re-deriving from the filter.
					basePlanItems: [{ feature_id: "contacts", included: 250_000 }],
					customerName: "Atlas Management Group",
					featureNames: {
						contacts: {
							name: "contacts",
							plural: "contacts",
							singular: "contact",
						},
					},
					planName: "Enterprise",
				},
				preview: {
					currency: "usd",
					customer_id: "cus_atlas",
					line_items: [],
					total: 189.1,
				},
			}),
		});

		const rendered = JSON.stringify(cardToBlockKit(card));
		expect(rendered).toContain("250,000 contacts");
		// Anchor on the cell boundary: "500,000 contacts" also contains "0 contacts".
		expect(rendered).not.toContain('"0 contacts"');
	});
});

// Ayush's report end to end through the real pipeline: a customer whose
// subscription holds 250,000 contacts, updated to 500,000 at a new base price.
// Every row must be an add or a remove derived from the current plan.
describe("update-subscription card, end to end from a real preview shape", () => {
	test("renders the customer's current plan diff as adds and removes", () => {
		const card = approvalCard({
			id: "u_atlas",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_atlas",
					customize: {
						add_items: [{ feature_id: "contacts", included: 500_000 }],
						price: { amount: 1600, interval: "month" },
						remove_items: [{ feature_id: "contacts" }],
					},
					plan_id: "enterprise",
				},
			},
			preview: wrapMcpResult({
				_display: {
					currentPlan: {
						id: "enterprise",
						items: [{ feature_id: "contacts", included: 250_000 }],
						name: "Enterprise",
						price: { amount: 1500, interval: "month" },
					},
					customerName: "Atlas Management Group",
					featureNames: {
						contacts: {
							name: "contacts",
							plural: "contacts",
							singular: "contact",
						},
					},
					planName: "Enterprise",
				},
				preview: {
					currency: "usd",
					customer_id: "cus_atlas",
					line_items: [
						{ amount: -315.16, description: "Unused Enterprise - Base Price" },
						{ amount: 504.26, description: "Enterprise - Base Price" },
					],
					total: 189.1,
				},
			}),
		});

		const json = JSON.stringify(card);
		const rows = (
			json.match(/\["(🟢 Add|🔴 Remove|🟠 Update)","[^"]*","[^"]*"\]/g) ?? []
		).map((row) => JSON.parse(row) as [string, string, string]);

		expect(rows).toEqual([
			["🔴 Remove", "Base price", "$1,500.00 per month"],
			["🔴 Remove", "250,000 contacts", "—"],
			["🟢 Add", "Base price", "$1,600.00 per month"],
			["🟢 Add", "500,000 contacts", "—"],
		]);
		expect(json).not.toContain("🟠 Update");
	});
});

// A free-trial override is a billing term the reviewer is authorizing; it
// must appear on the card as an add/remove like price, not vanish.
describe("free trial on the approval card", () => {
	test("renders a new trial as an add with its real duration", () => {
		const card = approvalCard({
			id: "t1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					customize: {
						free_trial: { duration_length: 14, duration_type: "day" },
					},
					plan_id: "pro",
				},
			},
		});
		expect(JSON.stringify(card)).toContain(
			'["🟢 Add","14-day free trial","—"]',
		);
	});

	test("renders removing a trial as a remove", () => {
		const card = approvalCard({
			id: "t2",
			env: AppEnv.Sandbox,
			toolName: "updateSubscription",
			toolArgs: {
				request: {
					customer_id: "cus_1",
					customize: { free_trial: null },
					plan_id: "pro",
				},
			},
			preview: wrapMcpResult({
				_display: {
					currentPlan: {
						free_trial: { duration_length: 1, duration_type: "month" },
					},
				},
				preview: { currency: "usd", line_items: [], total: 0 },
			}),
		});
		expect(JSON.stringify(card)).toContain(
			'["🔴 Remove","1-month free trial","—"]',
		);
	});
});
