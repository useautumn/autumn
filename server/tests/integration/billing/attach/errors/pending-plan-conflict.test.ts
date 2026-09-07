// Red: retrying a payment-failed upgrade minted a second open invoice + pending plan,
// and paying both crashed the second resume. Green: the retry is rejected with 409.

import { expect, test } from "bun:test";
import {
	type ApiCustomerV3,
	type AttachParamsV1Input,
	CusProductStatus,
	ErrCode,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 1: retrying a payment-failed upgrade is rejected until the invoice settles")}`,
	async () => {
		const customerId = "pending-plan-conflict-retry";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { autumnV1, autumnV2_4, ctx, customer } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [
				s.billing.attach({ productId: pro.id }),
				s.attachPaymentMethod({ type: "fail" }),
			],
		});

		const first = await autumnV2_4.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});
		expect(first.required_action?.code).toBe("payment_failed");

		await autumnV2_4.billing.previewAttach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: premium.id,
		});

		await expectAutumnError({
			errCode: ErrCode.PendingPlanConflict,
			errMessage: "pending plan",
			func: () =>
				autumnV2_4.billing.attach<AttachParamsV1Input>({
					customer_id: customerId,
					plan_id: premium.id,
				}),
		});

		const rawRetry = await fetch(`${autumnV2_4.baseUrl}/billing.attach`, {
			method: "POST",
			headers: autumnV2_4.headers,
			body: JSON.stringify({ customer_id: customerId, plan_id: premium.id }),
		});
		expect(rawRetry.status).toBe(409);

		const openInvoices = await ctx.stripeCli.invoices.list({
			customer: customer?.processor?.id ?? "",
			status: "open",
			limit: 100,
		});
		expect(openInvoices.has_more).toBe(false);
		expect(openInvoices.data).toHaveLength(1);

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

		const v3Customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);
		expectCustomerInvoiceCorrect({
			customer: v3Customer,
			count: 2,
			latestStatus: "paid",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("pending-plan-conflict 2: pending plans in other groups and add-ons do not block")}`,
	async () => {
		const customerId = "pending-plan-conflict-scope";

		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
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
	},
);
