/**
 * billing.update in invoice mode with invoice_mode.issue_method.
 *
 * Contract:
 *   price increase (proration invoice Autumn creates):
 *     draft → draft, auto_advance off · finalize → open, auto_advance off · send → open, auto_advance on
 *   a send_invoice subscription keeps its own terms (days until due, payment methods) when
 *   drafting or finalizing a change without terms of its own, instead of the org defaults
 *   errors: issue_method without enabled: true → 400
 */

import { test } from "bun:test";
import {
	BillingInterval,
	type InvoiceIssueMethod,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import { expectInvoicesIssuedAs } from "@tests/integration/billing/utils/expectInvoiceIssueMethodCorrect";
import { expectInvoiceSentOnTerms } from "@tests/integration/billing/utils/expectInvoiceSentOnTerms";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const SUBSCRIPTION_NET_TERMS_DAYS = 14;

type InvoiceModeInput = NonNullable<
	UpdateSubscriptionV1ParamsInput["invoice_mode"]
>;

const setupPaidPro = async ({ customerId }: { customerId: string }) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ testClock: false, paymentMethod: "success" }),
			s.products({ list: [pro] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});
	return { ...scenario, planId: pro.id };
};

const raisePrice = ({
	scenario,
	customerId,
	invoiceMode,
}: {
	scenario: Awaited<ReturnType<typeof setupPaidPro>>;
	customerId: string;
	invoiceMode: InvoiceModeInput;
}) =>
	scenario.autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
		customer_id: customerId,
		plan_id: scenario.planId,
		customize: { price: { amount: 30, interval: BillingInterval.Month } },
		invoice_mode: invoiceMode,
	});

const expectPriceIncreaseIssuedAs = async ({
	issueMethod,
}: {
	issueMethod: InvoiceIssueMethod;
}) => {
	const customerId = `update-issue-method-${issueMethod}`;
	const scenario = await setupPaidPro({ customerId });

	await raisePrice({
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
		issuedCount: 1,
	});
};

test.concurrent(
	`${chalk.yellowBright("update issue_method: draft → proration invoice stays a draft")}`,
	() => expectPriceIncreaseIssuedAs({ issueMethod: "draft" }),
);

test.concurrent(
	`${chalk.yellowBright("update issue_method: finalize → proration invoice open without auto_advance")}`,
	() => expectPriceIncreaseIssuedAs({ issueMethod: "finalize" }),
);

test.concurrent(
	`${chalk.yellowBright("update issue_method: send → proration invoice open with auto_advance")}`,
	() => expectPriceIncreaseIssuedAs({ issueMethod: "send" }),
);

test.concurrent(
	`${chalk.yellowBright("update issue_method: a send_invoice subscription keeps its own terms when finalizing")}`,
	async () => {
		const customerId = "update-issue-method-keeps-terms";
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const { autumnV2_3, autumnV2_4, ctx } = await initScenario({
			customerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [pro] })],
			actions: [],
		});
		await autumnV2_4.billing.attach({
			customer_id: customerId,
			plan_id: pro.id,
			invoice_mode: {
				enabled: true,
				enable_plan_immediately: true,
				net_terms_days: SUBSCRIPTION_NET_TERMS_DAYS,
				payment_method_types: ["card"],
			},
		});

		await autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: { amount: 30, interval: BillingInterval.Month } },
			invoice_mode: {
				enabled: true,
				issue_method: "finalize",
				enable_plan_immediately: true,
			},
		});

		const [latest] = await expectInvoicesIssuedAs({
			autumnV2_3,
			customerId,
			issueMethod: "finalize",
			count: 2,
			issuedCount: 1,
		});
		expectInvoiceSentOnTerms({
			stripeInvoice: await ctx.stripeCli.invoices.retrieve(latest.stripe_id),
			netTermsDays: SUBSCRIPTION_NET_TERMS_DAYS,
			paymentMethodTypes: ["card"],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("update issue_method errors: needs invoice mode enabled")}`,
	async () => {
		const customerId = "update-issue-method-errors";
		const scenario = await setupPaidPro({ customerId });

		await expectAutumnError({
			errMessage: "issue_method requires invoice_mode.enabled: true",
			func: () =>
				raisePrice({
					scenario,
					customerId,
					invoiceMode: { enabled: false, issue_method: "send" },
				}),
		});
	},
);
