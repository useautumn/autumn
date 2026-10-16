import { expect, test } from "bun:test";
import type {
	ApprovalAction,
	ApprovalRuleParams,
	InvoiceIssueMethod,
} from "@autumn/shared";
import { enforceApprovals } from "@tests/integration/approvals/utils/enforceApprovals";
import { expectDecisionLogged } from "@tests/integration/approvals/utils/expectDecisionLogged";
import {
	expectPermissionDenied,
	postRaw,
} from "@tests/integration/approvals/utils/expectPermissionDenied";
import { setupApprovalRules } from "@tests/integration/approvals/utils/setupApprovalRules";
import { createInvoice } from "@tests/integration/invoices/create/utils/expectCreatedInvoiceCorrect";
import { rules } from "@tests/utils/fixtures/rules";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

/** Invoice actions are checked against the member's rules on the invoice total and refund (E5b). */

const setupInvoiceRules = async ({
	customerId,
	when,
	actions,
}: {
	customerId: string;
	when: ApprovalRuleParams["when"];
	actions: ApprovalAction[];
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
			rules.rule({
				name: "Invoice limits",
				subjects: [{ type: "user", user_id: sales.userId }],
				actions,
				when,
			}),
		],
	});

	/** An invoice the owner creates with the secret key, which approvals don't check. */
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
	...(preview ? { preview } : {}),
});

test.concurrent(
	`${chalk.yellowBright("invoices enforce 1: a new invoice is judged on its preview total")}`,
	async () => {
		const customerId = "approvals-invoices-create";
		const { ctx, sales, client, cleanup } = await setupInvoiceRules({
			customerId,
			actions: ["invoices.create"],
			when: { total: { $lte: 100 } },
		});

		try {
			const within = await postRaw({
				client,
				path: "/invoices.create",
				body: customInvoice({ customerId, amount: 50 }),
			});
			expect(within.status).toBe(200);
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "invoices.create",
				verdict: "allow",
				enforced: true,
			});
			expect(decision.facts).toMatchObject({ total: 50, refund: null });

			// A preview writes nothing, so it isn't checked.
			const preview = await postRaw({
				client,
				path: "/invoices.create",
				body: customInvoice({ customerId, amount: 500, preview: true }),
			});
			expect(preview.status).toBe(200);

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.create",
					body: customInvoice({ customerId, amount: 500 }),
				}),
				violations: [{ field: "total", actual: "500" }],
			});
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 2: finalize, pay, update and void are judged on the invoice total")}`,
	async () => {
		const customerId = "approvals-invoices-existing";
		const { client, ownerInvoice, cleanup } = await setupInvoiceRules({
			customerId,
			actions: [
				"invoices.finalize",
				"invoices.pay",
				"invoices.update",
				"invoices.void",
			],
			when: { total: { $lte: 100 } },
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
					violations: [{ field: "total", actual: "500" }],
				});
			}
		} finally {
			await cleanup();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices enforce 3: a credit note is judged on what it credits")}`,
	async () => {
		const customerId = "approvals-invoices-credit-note";
		const { ctx, sales, client, ownerInvoice, cleanup } =
			await setupInvoiceRules({
				customerId,
				actions: ["invoices.credit_note"],
				when: { refund: { amount: { $lte: 10 } } },
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
			const decision = await expectDecisionLogged({
				ctx,
				userId: sales.userId,
				action: "invoices.credit_note",
				verdict: "allow",
				enforced: true,
			});
			expect(decision.facts).toMatchObject({
				total: 100,
				refund: { amount: 5 },
			});

			expectPermissionDenied({
				res: await postRaw({
					client,
					path: "/invoices.issue_credit_note",
					body: { invoice_id: invoiceId, amount: 50, send_email: false },
				}),
				violations: [{ field: "refund.amount", actual: "50" }],
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
		const { client, ownerInvoice, cleanup } = await setupInvoiceRules({
			customerId,
			actions: ["invoices.reissue"],
			when: { total: { $lte: 100 } },
		});

		try {
			const invoiceId = await ownerInvoice({
				amount: 500,
				issueMethod: "finalize",
			});

			// A preview writes nothing, so it isn't checked.
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
				violations: [{ field: "total", actual: "500" }],
			});
		} finally {
			await cleanup();
		}
	},
);
