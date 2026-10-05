/**
 * Attach Invoice Mode + No-Card Trial
 *
 * Contract:
 *  - a no-card trial attached in invoice mode is accepted by preview and attach: it trials in
 *    Autumn with no Stripe sub, and stores collection_method send_invoice for the trial-end invoice
 *  - custom invoice options (finalize: false, invoice_template_id, non-default net_terms_days)
 *    are rejected, since only the intent is stored for the trial-end invoice
 *  - invoice mode still needs a customer email
 *  - control: a card-required trial in invoice mode is unchanged
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CollectionMethod,
	FreeTrialDuration,
	type InvoiceModeParams,
	ms,
} from "@autumn/shared";
import { expectTrialCollectionMethod } from "@tests/integration/billing/attach/free-trial/no-card/utils/expectInvoicedTrialCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectProductTrialing } from "@tests/integration/billing/utils/expectCustomerProductTrialing";
import { expectSubCount } from "@tests/merged/mergeUtils/expectSubCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const TRIAL_DAYS = 15;
const TRIAL_INVOICE_OPTIONS_ERROR =
	"Invoice mode with a no-card free trial sends a finalized invoice";
const NO_EMAIL_ERROR = "has no email";

const enterprisePlan = () =>
	products.base({
		id: "enterprise",
		items: [items.monthlyPrice({ price: 50 })],
	});

const buildParams = ({
	customerId,
	planId,
	cardRequired,
	invoiceMode = {},
}: {
	customerId: string;
	planId: string;
	cardRequired: boolean;
	invoiceMode?: Partial<InvoiceModeParams>;
}): AttachParamsV1Input => ({
	customer_id: customerId,
	plan_id: planId,
	redirect_mode: "if_required",
	invoice_mode: { enabled: true, ...invoiceMode },
	customize: {
		free_trial: {
			duration_length: TRIAL_DAYS,
			duration_type: FreeTrialDuration.Day,
			card_required: cardRequired,
		},
	},
});

test.concurrent(
	`${chalk.yellowBright("attach-invoice-no-card-trial 1: preview and attach accept invoice mode, trial runs in Autumn")}`,
	async () => {
		const customerId = "inv-no-card-trial-attach";
		const enterprise = enterprisePlan();

		const { autumnV1, autumnV2_3, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [enterprise] })],
			actions: [],
		});

		const params = buildParams({
			customerId,
			planId: enterprise.id,
			cardRequired: false,
		});

		const preview =
			await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params);
		expect(preview.total).toBe(0);

		const result = await autumnV2_3.billing.attach<AttachParamsV1Input>(params);
		expect(result.payment_url).toBeFalsy();

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		await expectProductTrialing({
			customer,
			productId: enterprise.id,
			trialEndsAt: advancedTo + ms.days(TRIAL_DAYS),
		});
		await expectCustomerInvoiceCorrect({ customer, count: 0 });
		await expectSubCount({ ctx, customerId, count: 0 });
		await expectTrialCollectionMethod({
			ctx,
			customerId,
			productId: enterprise.id,
			collectionMethod: CollectionMethod.SendInvoice,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-no-card-trial 2: custom invoice options are rejected")}`,
	async () => {
		const customerId = "inv-no-card-trial-options";
		const enterprise = enterprisePlan();

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({}), s.products({ list: [enterprise] })],
			actions: [],
		});

		const customInvoiceOptions: Partial<InvoiceModeParams>[] = [
			{ finalize: false },
			{ net_terms_days: 45 },
			{ invoice_template_id: "tmpl_unsupported_for_trial" },
		];
		for (const invoiceMode of customInvoiceOptions) {
			const params = buildParams({
				customerId,
				planId: enterprise.id,
				cardRequired: false,
				invoiceMode,
			});
			await expectAutumnError({
				errMessage: TRIAL_INVOICE_OPTIONS_ERROR,
				func: () =>
					autumnV2_3.billing.previewAttach<AttachParamsV1Input>(params),
			});
			await expectAutumnError({
				errMessage: TRIAL_INVOICE_OPTIONS_ERROR,
				func: () => autumnV2_3.billing.attach<AttachParamsV1Input>(params),
			});
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-no-card-trial 3: invoice mode needs a customer email")}`,
	async () => {
		const customerId = "inv-no-card-trial-no-email";
		const enterprise = enterprisePlan();

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [s.customer({ email: null }), s.products({ list: [enterprise] })],
			actions: [],
		});

		await expectAutumnError({
			errMessage: NO_EMAIL_ERROR,
			func: () =>
				autumnV2_3.billing.attach<AttachParamsV1Input>(
					buildParams({
						customerId,
						planId: enterprise.id,
						cardRequired: false,
					}),
				),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("attach-invoice-no-card-trial 4 (control): card-required trial in invoice mode is allowed")}`,
	async () => {
		const customerId = "ctrl-inv-card-trial";
		const enterprise = enterprisePlan();

		const { autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [enterprise] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.previewAttach<AttachParamsV1Input>(
			buildParams({
				customerId,
				planId: enterprise.id,
				cardRequired: true,
				invoiceMode: { enable_plan_immediately: true, finalize: false },
			}),
		);
	},
);
