// Red: retrying a payment-failed upgrade minted a second open invoice + pending plan.
// Green: the retry returns the original open invoice; paid/void pending plans get 409.

import { expect, test } from "bun:test";
import {
	type AttachParamsV1Input,
	CusProductStatus,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { DEFAULT_CUS_PRODUCT_LIMIT } from "@/internal/misc/edgeConfig/orgLimitsStore";

/** Pro → premium upgrade whose first invoice fails on a declining card. */
const initFailedUpgrade = async ({
	customerId,
	extraProducts = [],
}: {
	customerId: string;
	extraProducts?: ReturnType<typeof products.base>[];
}) => {
	const pro = products.pro({
		id: "pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});
	const scenario = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium, ...extraProducts] }),
		],
		actions: [
			s.billing.attach({ productId: pro.id }),
			s.attachPaymentMethod({ type: "fail" }),
		],
	});

	const first = await scenario.autumnV2_4.billing.attach<AttachParamsV1Input>({
		customer_id: customerId,
		plan_id: premium.id,
	});
	expect(first.required_action?.code).toBe("payment_failed");
	expect(first.invoice?.status).toBe("open");

	return { ...scenario, pro, premium, first };
};

const expectOnlyOneOpenInvoice = async ({
	ctx,
	stripeCustomerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	stripeCustomerId: string;
}) => {
	const openInvoices = await ctx.stripeCli.invoices.list({
		customer: stripeCustomerId,
		status: "open",
		limit: 100,
	});
	expect(openInvoices.has_more).toBe(false);
	expect(openInvoices.data).toHaveLength(1);
};

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 1: retrying a payment-failed upgrade returns the original open invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-retry";
		const { autumnV1, autumnV2_4, ctx, customer, pro, premium, first } =
			await initFailedUpgrade({ customerId });

		await autumnV2_4.billing.previewAttach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(retry.invoice?.status).toBe("open");
		expect(retry.payment_url).toBe(retry.invoice?.hosted_invoice_url);
		expect(retry.required_action).toBeUndefined();

		await expectOnlyOneOpenInvoice({
			ctx,
			stripeCustomerId: customer?.processor?.id ?? "",
		});

		await payOpenInvoice({ ctx, customerId });

		await expectCustomerProducts({
			autumn: autumnV2_4,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			active: [premium.id],
			notPresent: [pro.id],
		});

		const premiumRows = (
			await CusProductService.list({
				db: ctx.db,
				internalCustomerId: customer?.internal_id ?? "",
				inStatuses: [CusProductStatus.Active, CusProductStatus.Pending],
			})
		).filter((row) => row.product.id === premium.id);
		expect(premiumRows).toHaveLength(1);
		expect(premiumRows[0].status).toBe(CusProductStatus.Active);

		await expectCustomerInvoiceCorrect({
			autumn: autumnV1,
			customerId,
			settleTimeoutMs: WEBHOOK_SETTLE_TIMEOUT_MS,
			count: 2,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 2: pending plans in other groups and add-ons do not block")}`,
	async () => {
		const customerId = "pending-plan-conflict-scope";
		const otherGroupPlan = products.base({
			id: "other-group",
			group: "other",
			items: [
				items.monthlyWords({ includedUsage: 100 }),
				items.monthlyPrice({ price: 15 }),
			],
		});
		const addOn = products.base({
			id: "addon",
			isAddOn: true,
			items: [
				items.monthlyCredits({ includedUsage: 10 }),
				items.monthlyPrice({ price: 5 }),
			],
		});

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const { autumnV2_4 } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, otherGroupPlan, addOn] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const otherGroupAttach =
			await autumnV2_4.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: otherGroupPlan.id,
			});
		expect(otherGroupAttach.required_action?.code).toBe("payment_failed");

		const addOnAttach = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: addOn.id,
		});
		expect(addOnAttach.required_action?.code).toBe("payment_failed");

		const upgrade = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(upgrade.required_action?.code).toBe("payment_failed");
		expect(upgrade.invoice?.stripe_id).not.toBe(
			otherGroupAttach.invoice?.stripe_id,
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 3: a different plan or multi_attach bundle in the same group resumes the original invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-multi";
		const growth = products.base({
			id: "growth",
			items: [
				items.monthlyMessages({ includedUsage: 1000 }),
				items.monthlyPrice({ price: 150 }),
			],
		});
		const { autumnV2_4, ctx, customer, premium, first } =
			await initFailedUpgrade({ customerId, extraProducts: [growth] });

		const differentPlan = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: growth.id,
		});
		expect(differentPlan.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(differentPlan.payment_url).toBe(
			differentPlan.invoice?.hosted_invoice_url,
		);

		await autumnV2_4.billing.previewMultiAttach({
			customer_id: customerId,
			plans: [{ plan_id: growth.id }],
		});

		const bundle = await autumnV2_4.billing.multiAttach({
			customer_id: customerId,
			plans: [{ plan_id: growth.id }],
		});
		expect(bundle.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(bundle.payment_url).toBe(bundle.invoice?.hosted_invoice_url);

		await expectOnlyOneOpenInvoice({
			ctx,
			stripeCustomerId: customer?.processor?.id ?? "",
		});

		const pendingRows = await CusProductService.list({
			db: ctx.db,
			internalCustomerId: customer?.internal_id ?? "",
			inStatuses: [CusProductStatus.Pending],
		});
		expect(pendingRows.map((row) => row.product.id)).toEqual([premium.id]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 4: a pending plan beyond the customer snapshot cap still resumes the original invoice")}`,
	async () => {
		const customerId = "pending-plan-conflict-capped";
		const addOns = Array.from({ length: DEFAULT_CUS_PRODUCT_LIMIT }, (_, i) =>
			products.base({
				id: `free-addon-${i}`,
				isAddOn: true,
				items: [items.monthlyCredits({ includedUsage: 1 })],
			}),
		);
		const { autumnV2_4, premium, first } = await initFailedUpgrade({
			customerId,
			extraProducts: addOns,
		});

		for (const addOn of addOns) {
			await autumnV2_4.billing.attach<AttachParamsV1Input>(
				{ customer_id: customerId, plan_id: addOn.id },
				{ timeout: 0 },
			);
		}

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 5: a voided pending invoice is never resumed and never replaced implicitly")}`,
	async () => {
		const customerId = "pending-plan-conflict-void";
		const { autumnV2_4, ctx, customer, premium, first } =
			await initFailedUpgrade({ customerId });

		await ctx.stripeCli.invoices.voidInvoice(first.invoice?.stripe_id ?? "");

		await expectAutumnError({
			errCode: ErrCode.PendingPlanConflict,
			errMessage: "invoice is void",
			func: () =>
				autumnV2_4.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
				}),
		});

		const openInvoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			status: "open",
			limit: 100,
		});
		expect(openInvoices.has_more).toBe(false);
		expect(openInvoices.data).toHaveLength(0);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 6: an open checkout session is arbitrated before the pending invoice is resumed")}`,
	async () => {
		const customerId = "pending-plan-conflict-checkout-lock";
		const credits = products.oneOffAddOn({
			id: "credits",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});
		const { autumnV2_4, ctx, customer, premium, first } =
			await initFailedUpgrade({ customerId, extraProducts: [credits] });

		const checkout = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: credits.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
			redirect_mode: "always",
		});
		expect(checkout.payment_url).toContain("checkout.stripe.com");

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(retry.invoice?.stripe_id).toBe(first.invoice?.stripe_id);
		expect(retry.payment_url).toBe(retry.invoice?.hosted_invoice_url);
		expect(retry.required_action).toBeUndefined();

		const sessions = await ctx.stripeCli.checkout.sessions.list({
			customer: customer?.processor?.id ?? "",
			limit: 100,
		});
		expect(sessions.has_more).toBe(false);
		expect(sessions.data.map((session) => session.status)).toEqual(["expired"]);
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 7: long-lived retry by internal id still expires the public-id checkout reservation")}`,
	async () => {
		const customerId = "pending-plan-conflict-long-lived-alias";
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const credits = products.oneOffAddOn({
			id: "credits",
			items: [items.oneOffWords({ billingUnits: 100, price: 10 })],
		});

		const { autumnV2_4, ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [premium, credits] }),
			],
			actions: [
				s.billing.attach({
					productId: premium.id,
					invoice: true,
					enableProductImmediately: false,
					finalizeInvoice: true,
				}),
			],
		});

		const checkout = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: credits.id,
			feature_quantities: [{ feature_id: TestFeature.Words, quantity: 100 }],
		});
		expect(checkout.payment_url).toContain("checkout.stripe.com");

		const retry = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customer?.internal_id ?? "",
			plan_id: premium.id,
			long_lived_checkout: true,
		});
		expect(retry.invoice?.status).toBe("open");
		expect(retry.payment_url).toBe(retry.invoice?.hosted_invoice_url);

		const sessions = await ctx.stripeCli.checkout.sessions.list({
			customer: customer?.processor?.id ?? "",
			limit: 100,
		});
		expect(sessions.has_more).toBe(false);
		expect(sessions.data.map((session) => session.status)).toEqual(["expired"]);
	},
);
