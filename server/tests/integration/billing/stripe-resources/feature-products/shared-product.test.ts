import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
import { expectCustomerProducts } from "@tests/integration/billing/utils/expectCustomerProductCorrect.js";
import { TestFeature } from "@tests/setup/v2Features.js";
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
	`${chalk.yellowBright("feature-products: Pro + Premium share one Stripe Product named after the feature")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-share-${suffix}`;
		const otherCustomerId = `fp-share-b-${suffix}`;
		const messages = items.consumableMessages();
		const pro = products.pro({ id: `fp-pro-${suffix}`, items: [messages] });
		const premium = products.premium({
			id: `fp-prem-${suffix}`,
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

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});
		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: otherCustomerId,
			plan_id: premium.id,
			redirect_mode: "if_required",
		});

		await expectCustomerProducts({
			customerId,
			autumn: autumnV2_3,
			active: [pro.id],
		});
		await expectCustomerProducts({
			customerId: otherCustomerId,
			autumn: autumnV2_3,
			active: [premium.id],
		});

		const feature = await getFeatureRow({ ctx });
		expect(feature.stripe_product_id).toBeString();
		expect(feature.name).toBe("Messages");

		const proUsage = await usagePriceForFeature({ ctx, productId: pro.id });
		const premiumUsage = await usagePriceForFeature({
			ctx,
			productId: premium.id,
		});

		expect(proUsage.config.stripe_product_id).toBe(feature.stripe_product_id);
		expect(premiumUsage.config.stripe_product_id).toBe(
			feature.stripe_product_id,
		);

		const stripeProduct = await ctx.stripeCli.products.retrieve(
			feature.stripe_product_id!,
		);
		expect(stripeProduct.name).toBe("Messages");
		expect(stripeProduct.name).not.toContain("Pro");
		expect(stripeProduct.name).not.toContain("Premium");
		expect(proUsage.config.feature_id).toBe(TestFeature.Messages);
	},
);
