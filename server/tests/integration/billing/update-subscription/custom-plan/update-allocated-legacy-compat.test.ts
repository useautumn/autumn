import { test } from "bun:test";
import type {
	ApiCustomerV3,
	UsagePriceConfig,
} from "@autumn/shared";
import { expectCustomerInvoiceCorrect } from "@tests/integration/billing/utils/expectCustomerInvoiceCorrect";
import { expectStripeSubscriptionCorrect } from "@tests/integration/billing/utils/expectStripeSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService";
import { ProductService } from "@/internal/products/ProductService";

test.concurrent(
	`${chalk.yellowBright("custom plan allocated legacy: PUT items keeps prorated billing")}`,
	async () => {
		const customerId = "custom-plan-allocated-legacy-put";
		const pro = products.pro({
			id: "pro",
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const fullProduct = await ProductService.getFull({
			db: ctx.db,
			idOrInternalId: pro.id,
			orgId: ctx.org.id,
			env: ctx.env,
		});
		const allocatedPrice = fullProduct.prices.find(
			(price) =>
				(price.config as UsagePriceConfig).feature_id === TestFeature.Users,
		);
		if (!allocatedPrice) {
			throw new Error("Expected allocated users price on pro plan");
		}

		const {
			allocated_billing_behavior: _allocatedBillingBehavior,
			...legacyConfig
		} = allocatedPrice.config as UsagePriceConfig;
		await PriceService.update({
			db: ctx.db,
			id: allocatedPrice.id,
			update: { config: legacyConfig },
		});

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			product_id: pro.id,
			items: [items.allocatedUsers({ includedUsage: 1 })],
		});

		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 2,
		});

		await autumnV1.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 3,
			latestTotal: 10,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
