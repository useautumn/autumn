import { test } from "bun:test";
import type {
	ApiCustomerV3,
	ApiPlanV1,
	CreatePlanItemParamsV1,
	UpdateSubscriptionV1ParamsInput,
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

		const { autumnV1, autumnV2_3, ctx } = await initScenario({
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

		const plan = await autumnV2_3.products.get<ApiPlanV1>(pro.id);
		const customizeItems: CreatePlanItemParamsV1[] = plan.items.map(
			({
				feature: _feature,
				reset,
				price,
				proration: _proration,
				rollover: _rollover,
				display: _display,
				...item
			}) => ({
				feature_id: item.feature_id,
				included: item.included,
				unlimited: item.unlimited,
				entity_feature_id: item.entity_feature_id,
				...(reset ? { reset } : {}),
				...(price ? { price } : {}),
			}),
		);
		await autumnV2_3.subscriptions.update<UpdateSubscriptionV1ParamsInput>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: {
				items: customizeItems,
			},
		});

		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 1,
			latestTotal: 20,
		});

		await autumnV2_3.track({
			customer_id: customerId,
			feature_id: TestFeature.Users,
			value: 2,
		});

		await expectCustomerInvoiceCorrect({
			customer: await autumnV1.customers.get<ApiCustomerV3>(customerId),
			count: 2,
			latestTotal: 10,
		});
		await expectStripeSubscriptionCorrect({ ctx, customerId });
	},
);
