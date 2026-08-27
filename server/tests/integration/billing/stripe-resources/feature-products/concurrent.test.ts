import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import {
	getFeatureRow,
	uniqueSuffix,
	usagePriceForFeature,
} from "./utils/createUnmintedFeaturePlans.js";

test.concurrent(
	`${chalk.yellowBright("feature-products: concurrent attach of two plans mints one Feature Stripe Product")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-conc-a-${suffix}`;
		const otherCustomerId = `fp-conc-b-${suffix}`;
		const messages = items.consumableMessages();
		const pro = products.pro({ id: `fp-conc-pro-${suffix}`, items: [messages] });
		const premium = products.premium({
			id: `fp-conc-prem-${suffix}`,
			items: [messages],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.otherCustomers([{ id: otherCustomerId, paymentMethod: "success" }]),
				s.products({ list: [pro, premium], createInStripe: false }),
			],
			actions: [],
		});

		await Promise.all([
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: customerId,
				plan_id: pro.id,
				redirect_mode: "if_required",
			}),
			autumnV2_3.billing.attach<AttachParamsV1Input>({
				customer_id: otherCustomerId,
				plan_id: premium.id,
				redirect_mode: "if_required",
			}),
		]);

		await Promise.all([
			expectCustomerProducts({
				customerId,
				autumn: autumnV2_3,
				active: [pro.id],
			}),
			expectCustomerProducts({
				customerId: otherCustomerId,
				autumn: autumnV2_3,
				active: [premium.id],
			}),
		]);

		const feature = await getFeatureRow({ ctx });
		expect(feature.stripe_product_id).toBeString();

		const proUsage = await usagePriceForFeature({ ctx, productId: pro.id });
		const premiumUsage = await usagePriceForFeature({
			ctx,
			productId: premium.id,
		});

		expect(proUsage.config.stripe_product_id).toBe(feature.stripe_product_id);
		expect(premiumUsage.config.stripe_product_id).toBe(
			feature.stripe_product_id,
		);
	},
);
