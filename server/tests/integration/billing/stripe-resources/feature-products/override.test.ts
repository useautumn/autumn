import { expect, test } from "bun:test";
import type { AttachParamsV1Input, UsagePriceConfig } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { PriceService } from "@/internal/products/prices/PriceService.js";
import {
	getFeatureRow,
	uniqueSuffix,
	usagePriceForFeature,
} from "./utils/createUnmintedFeaturePlans.js";

test.concurrent(
	`${chalk.yellowBright("feature-products: price-level stripe_product_id is an override and does not become the Feature default")}`,
	async () => {
		const suffix = uniqueSuffix();
		const customerId = `fp-ovr-${suffix}`;
		const pro = products.pro({
			id: `fp-ovr-pro-${suffix}`,
			items: [items.consumableMessages()],
		});

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro], createInStripe: false }),
			],
			actions: [],
		});

		const mapped = await ctx.stripeCli.products.create({
			name: `Mapped override ${suffix}`,
		});

		const before = await usagePriceForFeature({ ctx, productId: pro.id });
		const config = { ...before.config } as UsagePriceConfig;
		config.stripe_product_id = mapped.id;
		await PriceService.update({
			db: ctx.db,
			id: before.price.id!,
			update: { config },
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			redirect_mode: "if_required",
		});

		const feature = await getFeatureRow({ ctx });
		expect(feature.stripe_product_id ?? null).toBeNull();

		const after = await usagePriceForFeature({ ctx, productId: pro.id });
		expect(after.config.stripe_product_id).toBe(mapped.id);
	},
);
