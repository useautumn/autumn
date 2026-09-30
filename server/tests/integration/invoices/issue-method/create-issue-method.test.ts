/**
 * invoices.create issue_method.
 *
 * Contract:
 *   issue_method: "draft"    -> Stripe invoice stays draft, stored in Autumn as draft
 *   issue_method: "finalize" -> open with auto_advance off (no email, reminders or charge)
 *   omitted                  -> today's behavior: open with auto_advance on
 */

import { test } from "bun:test";
import type { InvoiceIssueMethod } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { createInvoice } from "../create/utils/expectCreatedInvoiceCorrect";
import { expectIssuedAs } from "./utils/issueMethodTestUtils";

const createWithIssueMethod = async ({
	customerId,
	issueMethod,
}: {
	customerId: string;
	issueMethod?: InvoiceIssueMethod;
}) => {
	const { autumnV2_3 } = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false })],
		actions: [],
	});
	const { invoice } = await createInvoice({
		autumnV2_3,
		params: {
			customer_id: customerId,
			custom_line_items: [{ description: "Onboarding", amount: 100 }],
			...(issueMethod ? { issue_method: issueMethod } : {}),
		},
	});
	if (!invoice) throw new Error("no invoice created");
	return invoice;
};

test.concurrent(
	`${chalk.yellowBright("invoices.create: issue_method draft → editable draft")}`,
	async () => {
		const invoice = await createWithIssueMethod({
			customerId: "inv-issue-create-draft",
			issueMethod: "draft",
		});
		await expectIssuedAs({ invoice, issueMethod: "draft" });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: issue_method finalize → open, auto_advance off")}`,
	async () => {
		const invoice = await createWithIssueMethod({
			customerId: "inv-issue-create-finalize",
			issueMethod: "finalize",
		});
		await expectIssuedAs({ invoice, issueMethod: "finalize" });
	},
);

test.concurrent(
	`${chalk.yellowBright("invoices.create: issue_method omitted → sent as today")}`,
	async () => {
		const invoice = await createWithIssueMethod({
			customerId: "inv-issue-create-default",
		});
		await expectIssuedAs({ invoice, issueMethod: "send" });
	},
);
