import { expect, test } from "bun:test";
import type { AttachParamsV1Input } from "@autumn/shared";
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
	`${chalk.yellowBright("feature-products: plan rename does not rename the feature Stripe Product")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-ren-${suffix}`;
		const pro = products.pro({
			id: `fp-ren-pro-${suffix}`,
			items: [items.consumableMessages()],
		});

		const { autumnV2_3, autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const feature = await getFeatureRow({ ctx });
		const usage = await usagePriceForFeature({ ctx, productId: pro.id });
		expect(feature.stripe_product_id).toBeString();
		expect(usage.fullProduct.processor?.id).toBeString();

		const renamedPlan = "Renamed Pro";
		await autumnV1.products.update(pro.id, { name: renamedPlan });

		const planProduct = await ctx.stripeCli.products.retrieve(
			usage.fullProduct.processor!.id,
		);
		expect(planProduct.name).toBe(renamedPlan);

		const featureProduct = await ctx.stripeCli.products.retrieve(
			feature.stripe_product_id!,
		);
		expect(featureProduct.name).toBe("Messages");
	},
);
