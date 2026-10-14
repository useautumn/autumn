/**
 * Attach in invoice mode with invoice_mode.issue_method.
 *
 * Contract:
 *   new plan (subscription's first invoice):
 *     draft    → draft, auto_advance off; plan pending until the invoice is finalized
 *     finalize → open, auto_advance off (Stripe never emails or charges); plan active
 *     send     → open, auto_advance on; plan active
 *   one-off (invoice Autumn creates itself):
 *     finalize → open, auto_advance off; plan active
 *   precedence: issue_method wins over the deprecated finalize
 *   back compat: finalize: false alone still drafts
 *   finalize with a plan waiting for payment: allowed, invoice open without auto_advance, plan pending;
 *     editing that pending plan re-issues its invoice silently too
 *   errors: issue_method without enabled: true → 400
 */

import { test } from "bun:test";
import {
	type AttachParamsV1Input,
	BillingInterval,
	CusProductStatus,
	type UpdateSubscriptionV1ParamsInput,
} from "@autumn/shared";
import {
	expectInvoicesIssuedAs,
	expectPlanStatus,
} from "@tests/integration/billing/utils/expectInvoiceIssueMethodCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const ISSUE_METHOD_WITHOUT_INVOICE_MODE_ERROR =
	"issue_method requires invoice_mode.enabled: true";

type InvoiceModeInput = NonNullable<AttachParamsV1Input["invoice_mode"]>;

const setupPlan = async ({
	customerId,
	oneOff = false,
}: {
	customerId: string;
	oneOff?: boolean;
}) => {
	const plan = oneOff
		? products.oneOff({
				id: "one-off-credits",
				items: [
					items.oneOffMessages({
						includedUsage: 0,
						billingUnits: 100,
						price: 10,
					}),
				],
			})
		: products.pro({
				id: "pro",
				items: [items.monthlyMessages({ includedUsage: 100 })],
			});
	const scenario = await initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [],
	});
	return { ...scenario, planId: plan.id };
};

const attachWithInvoiceMode = async ({
	scenario,
	customerId,
	invoiceMode,
	oneOff = false,
}: {
	scenario: Awaited<ReturnType<typeof setupPlan>>;
	customerId: string;
	invoiceMode: InvoiceModeInput;
	oneOff?: boolean;
}) =>
	scenario.autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: scenario.planId,
		redirect_mode: "if_required",
		invoice_mode: invoiceMode,
		...(oneOff
			? {
					feature_quantities: [
						{ feature_id: TestFeature.Messages, quantity: 100 },
					],
				}
			: {}),
	});

test.concurrent(
	`${chalk.yellowBright("attach issue_method: draft → first invoice stays a draft, plan pending until finalized")}`,
	async () => {
		const customerId = "attach-issue-method-draft";
		const scenario = await setupPlan({ customerId });

		await attachWithInvoiceMode({
			scenario,
			customerId,
			invoiceMode: {
				enabled: true,
				issue_method: "draft",
				enable_plan_immediately: true,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "draft",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Pending,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: finalize → first invoice open without auto_advance, plan active")}`,
	async () => {
		const customerId = "attach-issue-method-finalize";
		const scenario = await setupPlan({ customerId });

		await attachWithInvoiceMode({
			scenario,
			customerId,
			invoiceMode: {
				enabled: true,
				issue_method: "finalize",
				enable_plan_immediately: true,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "finalize",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Active,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: send → first invoice open with auto_advance, plan active")}`,
	async () => {
		const customerId = "attach-issue-method-send";
		const scenario = await setupPlan({ customerId });

		await attachWithInvoiceMode({
			scenario,
			customerId,
			invoiceMode: {
				enabled: true,
				issue_method: "send",
				enable_plan_immediately: true,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "send",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Active,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: one-off finalize → Autumn's own invoice opens without auto_advance")}`,
	async () => {
		const customerId = "attach-issue-method-one-off";
		const scenario = await setupPlan({ customerId, oneOff: true });

		await attachWithInvoiceMode({
			scenario,
			customerId,
			oneOff: true,
			invoiceMode: {
				enabled: true,
				issue_method: "finalize",
				enable_plan_immediately: true,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "finalize",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Active,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: wins over finalize, and finalize alone keeps working")}`,
	async () => {
		const precedenceCustomerId = "attach-issue-method-precedence";
		const precedence = await setupPlan({ customerId: precedenceCustomerId });
		await attachWithInvoiceMode({
			scenario: precedence,
			customerId: precedenceCustomerId,
			invoiceMode: {
				enabled: true,
				finalize: false,
				issue_method: "send",
				enable_plan_immediately: true,
			},
		});
		await expectInvoicesIssuedAs({
			autumnV2_3: precedence.autumnV2_3,
			customerId: precedenceCustomerId,
			issueMethod: "send",
			count: 1,
		});

		const legacyCustomerId = "attach-issue-method-legacy-finalize";
		const legacy = await setupPlan({ customerId: legacyCustomerId });
		await attachWithInvoiceMode({
			scenario: legacy,
			customerId: legacyCustomerId,
			invoiceMode: {
				enabled: true,
				finalize: false,
				enable_plan_immediately: true,
			},
		});
		await expectInvoicesIssuedAs({
			autumnV2_3: legacy.autumnV2_3,
			customerId: legacyCustomerId,
			issueMethod: "draft",
			count: 1,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method errors: needs invoice mode enabled")}`,
	async () => {
		const customerId = "attach-issue-method-errors";
		const scenario = await setupPlan({ customerId });

		await expectAutumnError({
			errMessage: ISSUE_METHOD_WITHOUT_INVOICE_MODE_ERROR,
			func: () =>
				attachWithInvoiceMode({
					scenario,
					customerId,
					invoiceMode: { enabled: false, issue_method: "draft" },
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: finalize with a plan waiting for payment → open without auto_advance, plan pending")}`,
	async () => {
		const customerId = "attach-issue-method-finalize-deferred";
		const scenario = await setupPlan({ customerId });

		await attachWithInvoiceMode({
			scenario,
			customerId,
			invoiceMode: {
				enabled: true,
				issue_method: "finalize",
				enable_plan_immediately: false,
			},
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "finalize",
			count: 1,
		});
		await expectPlanStatus({
			customerId,
			planId: scenario.planId,
			status: CusProductStatus.Pending,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach issue_method: editing a plan pending on a silent invoice re-issues it silently")}`,
	async () => {
		const customerId = "attach-issue-method-finalize-pending-edit";
		const scenario = await setupPlan({ customerId });
		await attachWithInvoiceMode({
			scenario,
			customerId,
			invoiceMode: {
				enabled: true,
				issue_method: "finalize",
				enable_plan_immediately: false,
			},
		});

		await scenario.autumnV2_4.billing.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: scenario.planId,
			customize: { price: { amount: 30, interval: BillingInterval.Month } },
		});

		await expectInvoicesIssuedAs({
			autumnV2_3: scenario.autumnV2_3,
			customerId,
			issueMethod: "finalize",
			count: 2,
			issuedCount: 1,
		});
	},
);
