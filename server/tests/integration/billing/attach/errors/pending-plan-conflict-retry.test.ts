import { expect, test } from "bun:test";
import { type AttachParamsV1Input, CusProductStatus } from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { WEBHOOK_SETTLE_TIMEOUT_MS } from "@tests/utils/pollableCustomerExpect";
import { payOpenInvoice } from "@tests/utils/stripeUtils/payOpenInvoice";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import {
	expectOnlyOneOpenInvoice,
	initFailedUpgrade,
} from "./utils/pendingPlanConflict";

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
