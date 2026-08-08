import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import {
	approvalCard,
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
	test("leads with the action sentence and structured money facts", () => {
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
			requesterId: "U1",
			preview: wrapMcpResult({
				pending: true,
				preview: {
					total: 400,
					currency: "usd",
					next_cycle: { total: 400, starts_at: Date.UTC(2026, 6, 12) },
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(card.title).toBe("Attach plan");
		expect(card.subtitle).toContain("Sandbox");
		expect(card.subtitle).toContain("requested by <@U1>");
		expect(json).toContain(
			"Attach **enterprise** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**?",
		);
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		expect(json).toContain("Next charge on Jul 12, 2026 — $400.00");
		expect(json).toContain("✓ Invoice (draft)");
		expect(json).not.toContain("Prorations");
		expect(card.children.at(-1)?.type).toBe("actions");
		expect(json).toContain("approve_billing_action");
		expect(json).toContain("Dismiss");
		expect(json).not.toContain('"request"');
	});

	test("uses the plan name as the attach subject without repeating it", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: {
				request: { customer_id: "testa", plan_id: "mc_e2e_sdkce88" },
			},
			preview: wrapMcpResult({
				preview: {
					incoming: [
						{
							plan_id: "mc_e2e_sdkce88",
							plan: { name: "MC E2E Plan" },
						},
					],
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Attach **MC E2E Plan** to **testa**?");
		expect(json).not.toContain("Attach **mc_e2e_sdkce88**");
		expect(json).not.toContain("Attaching MC E2E Plan");
	});

	test("escalates live environment on the subtitle and approve button", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Live,
			toolName: "attach",
			toolArgs: attachArgs,
		});

		expect(card.subtitle).toContain("🔴 Live");
		expect(JSON.stringify(card)).toContain("Approve in Live");
		expect(JSON.stringify(card)).toContain(
			"https://app.useautumn.com/customers/kp-customer-1000",
		);
	});

	test("shows custom prices as the recurring price, not a param dump", () => {
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
		expect(json).toContain("Recurring price");
		expect(json).toContain("$200.00/month");
		expect(json).not.toContain('"customize"');
	});

	test("omits badges and money facts when nothing was set", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const types = card.children.map((child) => child.type);
		expect(types).toEqual(["text", "actions"]);
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

	test("folds the agent's preview prose into the card as one message", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: attachArgs,
			summary:
				"Preview — Scale Yearly, custom $8,000/yr:\n- Due now: $8,000\n- Term: 12 Jun 2026 → 12 Jun 2027\n\nApprove to attach?",
		});

		const json = JSON.stringify(card);
		expect(json).toContain("Preview — Scale Yearly, custom $8,000/yr:");
		expect(json).toContain("• Due now: $8,000");
		// The canned sentence is redundant when the agent narrated the preview.
		expect(json).not.toContain(
			"Attach **enterprise** to **kp-customer-1000**?",
		);
		expect(json).toContain("approve_billing_action");
	});

	test("offers a payload viewer button", () => {
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const json = JSON.stringify(card);
		expect(json).toContain("view_approval_payload");
		expect(json).toContain("View Payload");
	});

	test("renders customized add_items and remove_items as grouped changes", () => {
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Sandbox,
			toolName: "attach",
			toolArgs: {
				request: {
					...attachArgs.request,
					customize: {
						add_items: [
							{ feature_id: "seats", unlimited: true },
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
							{ feature_id: "credits" },
							{ feature_id: "audit_logs" },
							{ billing_method: "prepaid", interval: "year" },
						],
					},
				},
			},
			preview: wrapMcpResult({
				preview: {
					incoming: [
						{
							plan: {
								items: [
									{ feature_id: "seats", feature: { name: "Seats" } },
									{ feature_id: "credits", feature: { name: "Credits" } },
									{ feature_id: "api_calls", feature: { name: "API Calls" } },
								],
							},
						},
					],
					outgoing: [
						{
							plan: {
								items: [
									{ feature_id: "credits", feature: { name: "Credits" } },
									{ feature_id: "audit_logs", feature: { name: "Audit Logs" } },
								],
							},
						},
					],
				},
			}),
		});

		const json = JSON.stringify(card);
		expect(json).toContain("**Updated plan items**");
		expect(json).toContain(
			"• Credits — 5,000 included, then $0.10 each · usage-based · monthly",
		);
		expect(json).toContain("**Added to plan**");
		expect(json).toContain("• Seats — unlimited");
		expect(json).toContain("• API Calls — $5.00 per 1,000 · usage-based");
		expect(json).toContain("**Removed from plan**");
		expect(json).toContain("• Audit Logs");
		expect(json).toContain("• prepaid · yearly");
		expect(json).not.toContain("**Plan changes**");
	});

	test("shows no charge today and keeps the full removal list", () => {
		const removeItems = Array.from({ length: 10 }, (_, index) => ({
			feature_id: `feature_${index + 1}`,
		}));
		const card = approvalCard({
			id: "approval_1",
			toolName: "attach",
			toolArgs: {
				request: {
					...attachArgs.request,
					customize: { remove_items: removeItems },
				},
			},
			preview: wrapMcpResult({ preview: { total: 0, currency: "usd" } }),
		});

		const json = JSON.stringify(card);
		expect(json).toContain("No charge today");
		expect(json).toContain("Feature 10");
		expect(json).not.toContain("No charge now");
	});

	test("shortens UUID customer labels without shortening their link", () => {
		const customerId = "085298c2-2d68-429b-a583-2165976701fa";
		const card = approvalCard({
			id: "approval_1",
			env: AppEnv.Live,
			toolName: "attach",
			toolArgs: { request: { customer_id: customerId, plan_id: "pro" } },
		});
		const json = JSON.stringify(card);

		expect(json).toContain("085298c2…701fa");
		expect(json).toContain(`/customers/${customerId}`);
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
		expect(modal.title).toBe("Tool payload");
		expect(json).toContain("kp-customer-1000");
		expect(json).toContain("```");
		expect(json).toContain("`attach` request");
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
		expect(card.subtitle).toContain("approved by <@U1>");
		expect(json).toContain(
			"Attaching **enterprise** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**…",
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
			"✅ Attached **enterprise** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**",
		);
		expect(json).toContain("Draft invoice — $0.00");
		// Drafts link to the dashboard — the hosted page is not payable yet.
		expect(json).toContain("Open draft in Stripe");
		expect(json).toContain("https://dashboard.stripe.com/test/invoices/in_123");
		expect(json).toContain("Open checkout");
		expect(json).toContain("https://pay.example");
		expect(json).not.toContain("View customer");
		expect(json).toContain("approved by <@U1>");
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
		expect(json).toContain("✅ Attached **enterprise**");
		expect(json).toContain("Due now");
		expect(json).toContain("$400.00");
		expect(card.subtitle).toContain("approved by <@U1>");
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
		expect(json).toContain("Sandbox");
		expect(json).toContain(
			"Attach **enterprise** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**?",
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
			toolName: "attach",
			toolArgs: attachArgs,
		});

		const supersededJson = JSON.stringify(superseded);
		expect(superseded.title).toBe("Attach plan");
		expect(supersededJson).toContain("Sandbox");
		expect(supersededJson).toContain(
			"Attach **enterprise** to **<https://app.useautumn.com/sandbox/customers/kp-customer-1000|kp-customer-1000>**?",
		);
		expect(supersededJson).toContain("Due now");
		expect(supersededJson).toContain("$400.00");
		expect(supersededJson).toContain("Superseded");
		// Settled state is a non-interactive status line, not a (fake) button row.
		expect(superseded.children.at(-1)?.type).toBe("text");
		expect(supersededJson).not.toContain('"type":"actions"');
		expect(supersededJson).not.toContain("approve_billing_action");
		expect(supersededJson).not.toContain("cancel_billing_action");
		expect(supersededJson).not.toContain("view_approval_payload");
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
