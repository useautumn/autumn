import { expect, test } from "bun:test";
import { type ApiCustomerV3, BillingInterval } from "@autumn/shared";
import { expectCustomerFeatureCorrect } from "@tests/integration/billing/utils/expectCustomerFeatureCorrect";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { calculateCrossIntervalUpgrade } from "@tests/integration/billing/utils/proration";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("immediate-switch-basic 7: pro annual to premium monthly (interval change)")}`,
	async () => {
		const customerId = "imm-switch-pro-annual-to-premium";

		const proAnnualMessages = items.monthlyMessages({ includedUsage: 500 });
		const proAnnualPrice = items.annualPrice({ price: 200 });
		const premiumMonthlyPrice = items.monthlyPrice({ price: 50 });
		const proAnnual = products.base({
			id: "pro-annual",
			items: [proAnnualMessages, proAnnualPrice],
		});

		const premiumMessages = items.monthlyMessages({ includedUsage: 1000 });
		const premium = products.base({
			id: "premium",
			items: [premiumMessages, premiumMonthlyPrice],
		});

		const { autumnV1, ctx, advancedTo } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [proAnnual, premium] }),
			],
			actions: [s.billing.attach({ productId: proAnnual.id })],
		});

		const expectedTotal = await calculateCrossIntervalUpgrade({
			customerId,
			advancedTo,
			oldAmount: 200,
			newAmount: 50,
			oldInterval: "year",
			newInterval: BillingInterval.Month,
		});

		const preview = await autumnV1.billing.previewAttach({
			customer_id: customerId,
			product_id: premium.id,
		});
		expect(preview.total).toBeCloseTo(expectedTotal, 0);

		await autumnV1.billing.attach({
			customer_id: customerId,
			product_id: premium.id,
			redirect_mode: "if_required",
		});

		const customer = await autumnV1.customers.get<ApiCustomerV3>(customerId);

		await expectCustomerProducts({
			customer,
			active: [premium.id],
			notPresent: [proAnnual.id],
		});

		expectCustomerFeatureCorrect({
			customer,
			featureId: TestFeature.Messages,
			includedUsage: 1000,
			balance: 1000,
			usage: 0,
		});

		await expectCustomerInvoiceCorrect({
			customer,
			count: 2,
			latestTotal: expectedTotal,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
