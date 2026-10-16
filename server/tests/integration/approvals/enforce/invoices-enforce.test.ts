import { expect, test } from "bun:test";
import type { ApprovalRuleParams, InvoiceIssueMethod } from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { listDecisions } from "@tests/integration/approvals/utils/expectDecisionLogged";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { createInvoice } from "@tests/integration/invoices/create/utils/expectCreatedInvoiceCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

/** Invoice actions are checked against the member's rules on the invoice total and credit amount (E5b). */

const RULE_NAME = "Invoice limits";

const setupInvoiceBlock = async ({
	customerId,
	actions,
	filter,
}: {
	customerId: string;
	actions: ApprovalRuleParams["actions"];
	filter: ApprovalRuleParams["filter"];
}) => {
	const { ctx, members, autumnV2_3 } = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false }),
			s.member({ role: "owner" }),
			s.member({ role: "sales" }),
		],
		actions: [],
	});
	const [owner, sales] = members;
	const { client, cleanup } = await setupApprovalRules({
		ctx,
		owner,
		member: sales,
		rules: [
			rules.block({
				name: RULE_NAME,
				subjects: [{ type: "user", user_id: sales.userId }],
				actions,
				filter,
			}),
		],
	});

	/** Created with the secret key, which approvals skip. */
	const ownerInvoice = async ({
		amount,
		issueMethod,
	}: {
		amount: number;
		issueMethod: InvoiceIssueMethod;
	}) => {
		const { invoice } = await createInvoice({
			autumnV2_3,
			params: {
				customer_id: customerId,
				custom_line_items: [{ description: "Services", amount }],
				issue_method: issueMethod,
			},
		});
		if (!invoice) throw new Error("no invoice created");
		return invoice.id;
	};

	return {
		ctx,
		sales,
		client: enforceApprovals(client),
		ownerInvoice,
		cleanup,
	};
};

const customInvoice = ({
	customerId,
	amount,
	preview,
}: {
	customerId: string;
	amount: number;
	preview?: boolean;
}) => ({
	customer_id: customerId,
	custom_line_items: [{ description: "Services", amount }],
	...(preview && { preview }),
});

test.concurrent(
	`${chalk.yellowBright("invoices enforce 1: a new invoice over the limit is denied on its preview total, and a denied new customer is never created")}`,
	async () => {
		const customerId = "approvals-invoices-create";
		const { ctx, sales, client, cleanup } = await setupInvoiceBlock({
			customerId,
			actions: ["invoices.create"],
			filter: { total: { $gt: 100 } },
		});

		try {
			const within = await postRaw({
				client,
				path: "/invoices.create",
				body: customInvoice({ customerId, amount: 50 }),
			});
			expect(within.status).toBe(200);

			const preview = await postRaw({
				client,
				path: "/invoices.create",
				body: customInvoice({ customerId, amount: 500, preview: true }),
			});
			expect(preview.status).toBe(200);
			expect(preview.body.preview.permission).toBeUndefined();

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.create",
					body: customInvoice({ customerId, amount: 500 }),
				}),
				ruleName: RULE_NAME,
				violations: [{ field: "total" }],
			});
			const [decision] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "invoices.create",
			});
			expect(decision).toMatchObject({ verdict: "deny", enforced: true });
			expect(decision.facts).toMatchObject({
				customer: { id: customerId, has_paid: false },
				total: 500,
				refund: null,
			});

			const newCustomerId = `approvals-invoices-new-${Date.now()}`;
			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.create",
					body: customInvoice({ customerId: newCustomerId, amount: 500 }),
				}),
				ruleName: RULE_NAME,
			});
			expect(
				await CusService.get({
					db: ctx.db,
					idOrInternalId: newCustomerId,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
			).toBeFalsy();
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 2: finalize, pay, update and void are judged on the invoice total")}`,
	async () => {
		const customerId = "approvals-invoices-existing";
		const { client, ownerInvoice, cleanup } = await setupInvoiceBlock({
			customerId,
			actions: [
				"invoices.finalize",
				"invoices.pay",
				"invoices.update",
				"invoices.void",
			],
			filter: { total: { $gt: 100 } },
		});

		try {
			const small = await ownerInvoice({ amount: 50, issueMethod: "draft" });
			const finalized = await postRaw({
				client,
				path: "/invoices.finalize",
				body: { invoice_id: small },
			});
			expect(finalized.status).toBe(200);

			const large = await ownerInvoice({ amount: 500, issueMethod: "draft" });
			for (const [path, body] of [
				["/invoices.finalize", { invoice_id: large }],
				["/invoices.pay", { invoice_id: large }],
				[
					"/invoices.update",
					{ invoice_id: large, payment_method_types: ["card"] },
				],
				["/invoices.void", { invoice_id: large }],
			] as const) {
				expectPermissionDenied({
					res: await postRaw({ client, path, body }),
					ruleName: RULE_NAME,
					violations: [{ field: "total" }],
				});
			}

			const missing = await postRaw({
				client,
				path: "/invoices.void",
				body: { invoice_id: "inv_missing" },
			});
			expect(missing.status).toBe(400);
			expect(missing.body.message).toContain("not found");
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 3: a credit note is judged on what it credits, as invoices.issue_credit_note")}`,
	async () => {
		const customerId = "approvals-invoices-credit-note";
		const { ctx, sales, client, ownerInvoice, cleanup } =
			await setupInvoiceBlock({
				customerId,
				actions: ["invoices.issue_credit_note"],
				filter: { refund: { amount: { $gt: 10 } } },
			});

		try {
			const invoiceId = await ownerInvoice({
				amount: 100,
				issueMethod: "finalize",
			});

			const small = await postRaw({
				client,
				path: "/invoices.issue_credit_note",
				body: { invoice_id: invoiceId, amount: 5, send_email: false },
			});
			expect(small.status).toBe(200);
			const [allowed] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "invoices.issue_credit_note",
			});
			expect(allowed).toBeUndefined();

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.issue_credit_note",
					body: { invoice_id: invoiceId, amount: 50, send_email: false },
				}),
				ruleName: RULE_NAME,
				violations: [{ field: "refund.amount" }],
			});
			const [denied] = await listDecisions({
				ctx,
				userId: sales.userId,
				action: "invoices.issue_credit_note",
			});
			expect(denied.facts).toMatchObject({
				total: 100,
				refund: { amount: 50 },
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 4: a reissue is judged on the replacement's total")}`,
	async () => {
		const customerId = "approvals-invoices-reissue";
		const { client, ownerInvoice, cleanup } = await setupInvoiceBlock({
			customerId,
			actions: ["invoices.reissue"],
			filter: { total: { $gt: 100 } },
		});

		try {
			const invoiceId = await ownerInvoice({
				amount: 500,
				issueMethod: "finalize",
			});

			const preview = await postRaw({
				client,
				path: "/invoices.reissue",
				body: { invoice_id: invoiceId, preview: true },
			});
			expect(preview.status).toBe(200);

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.reissue",
					body: { invoice_id: invoiceId },
				}),
				ruleName: RULE_NAME,
				violations: [{ field: "total" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 5: a new customer's invoice is judged with the default plans it would get")}`,
	async () => {
		const suffix = Date.now();
		const free = products.base({
			id: "free",
			isDefault: true,
			items: [items.monthlyMessages({ includedUsage: 10 })],
		});
		const { ctx, members } = await initScenario({
			customerId: `approvals-invoices-defaults-${suffix}`,
			setup: [
				s.platform.create({
					setupDefaultFeatures: true,
					userEmail: `approvals-invoices-defaults-${suffix}@autumn.test`,
				}),
				s.products({ list: [free] }),
				s.member({ role: "owner" }),
				s.member({ role: "sales" }),
			],
			actions: [],
		});
		const [owner, sales] = members;
		const ruleName = "No invoices for free customers";
		const { client, cleanup } = await setupApprovalRules({
			ctx,
			owner,
			member: sales,
			rules: [
				rules.block({
					name: ruleName,
					subjects: [{ type: "user", user_id: sales.userId }],
					actions: ["invoices.create"],
					filter: { customer: { plan: { $some: { plan_id: free.id } } } },
				}),
			],
		});

		try {
			const newCustomerId = `approvals-invoices-new-default-${suffix}`;
			expectPermissionDenied({
				res: await postRaw({
					client: enforceApprovals(client),
					path: "/invoices.create",
					body: customInvoice({ customerId: newCustomerId, amount: 50 }),
				}),
				ruleName,
			});
			expect(
				await CusService.get({
					db: ctx.db,
					idOrInternalId: newCustomerId,
					orgId: ctx.org.id,
					env: ctx.env,
				}),
			).toBeFalsy();
		} finally {
			await cleanup();
		}
	},
);
