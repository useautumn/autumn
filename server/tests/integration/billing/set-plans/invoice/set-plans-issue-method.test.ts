/**
 * set_plans in invoice mode with invoice_mode.issue_method. finalize and send run on the one request
 * that makes both invoices set_plans can create: the new subscription's first invoice, and the
 * invoice for usage accrued on a plan no subscription billed.
 *
 * Setup: pro ($20/mo, 100 messages, $0.10 over) attached without billing, 150 messages tracked,
 * then re-listed by set_plans so its subscription starts now.
 *
 * Contract:
 *   finalize → both open with auto_advance off
 *   send     → both open with auto_advance on
 *   draft    → on a new subscription's first invoice: a draft with auto_advance off, plan pending
 *   errors: issue_method without enabled: true → 400
 *   draft with accrued usage: set-plans-draft-usage-replay.test.ts
 */

import { test } from "bun:test";
import {
	CusProductStatus,
	type InvoiceIssueMethod,
	type SetPlansParamsV0Input,
} from "@autumn/shared";
import {
	expectInvoicesIssuedAs,
	expectPlanStatus,
} from "@tests/integration/billing/utils/expectInvoiceIssueMethodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { timeout } from "@tests/utils/genUtils";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type InvoiceModeInput = NonNullable<SetPlansParamsV0Input["invoice_mode"]>;

const setupUnbilledProInOverage = async ({
	customerId,
}: {
	customerId: string;
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.consumableMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
		actions: [],
	});
	await scenario.autumnV2_4.billing.attach({
		customer_id: customerId,
		plan_id: pro.id,
		no_billing_changes: true,
		redirect_mode: "never",
	});
	await scenario.autumnV1.track({
		customer_id: customerId,
		feature_id: TestFeature.Messages,
		value: 150,
	});
	await timeout(2000);
	return { ...scenario, planId: pro.id };
};

const relistPro = ({
	scenario,
	customerId,
	invoiceMode,
}: {
	scenario: Awaited<ReturnType<typeof setupUnbilledProInOverage>>;
	customerId: string;
	invoiceMode: InvoiceModeInput;
}) =>
	scenario.autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
		customer_id: customerId,
		redirect_mode: "if_required",
		phases: [{ starts_at: "now", plans: [{ plan_id: scenario.planId }] }],
		invoice_mode: invoiceMode,
	});

const expectBothInvoicesIssuedAs = async ({
	issueMethod,
}: {
	issueMethod: InvoiceIssueMethod;
}) => {
	const customerId = `set-plans-issue-method-${issueMethod}`;
	const scenario = await setupUnbilledProInOverage({ customerId });

	await relistPro({
		scenario,
		customerId,
		invoiceMode: {
			enabled: true,
			issue_method: issueMethod,
			enable_plan_immediately: true,
		},
	});

	await expectInvoicesIssuedAs({
		autumnV2_3: scenario.autumnV2_3,
		customerId,
		issueMethod,
		count: 2,
	});
};

test.concurrent(
	`${chalk.yellowBright("set_plans issue_method: finalize → subscription and usage invoices both open without auto_advance")}`,
	() => expectBothInvoicesIssuedAs({ issueMethod: "finalize" }),
);

test.concurrent(
	`${chalk.yellowBright("set_plans issue_method: send → subscription and usage invoices both open with auto_advance")}`,
	() => expectBothInvoicesIssuedAs({ issueMethod: "send" }),
);

test.concurrent(
	`${chalk.yellowBright("set_plans issue_method: draft → a new subscription's first invoice stays a draft, plan pending")}`,
	async () => {
		const customerId = "set-plans-issue-method-draft";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4 } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});

		await autumnV2_4.billing.setPlans<SetPlansParamsV0Input>({
			customer_id: customerId,
			redirect_mode: "if_required",
			phases: [{ starts_at: "now", plans: [{ plan_id: pro.id }] }],
			invoice_mode: {
				enabled: true,
				issue_method: "draft",
				enable_plan_immediately: true,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3,
			customerId,
			issueMethod: "draft",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: pro.id,
			status: CusProductStatus.Pending,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("set_plans issue_method errors: needs invoice mode enabled")}`,
	async () => {
		const customerId = "set-plans-issue-method-errors";
		const scenario = await setupUnbilledProInOverage({ customerId });

		await expectAutumnError({
			errMessage: "issue_method requires invoice_mode.enabled: true",
			func: () =>
				relistPro({
					scenario,
					customerId,
					invoiceMode: { enabled: false, issue_method: "draft" },
				}),
		});
	},
);
