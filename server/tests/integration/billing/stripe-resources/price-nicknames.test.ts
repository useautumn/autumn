/**
 * Stripe Price nicknames at mint time.
 *
 * Contract:
 *   catalog fixed → "Base price"
 *   catalog prepaid → "Prepaid price (Messages)"
 *   catalog usage → "Usage-based price (Words)"
 *   attach customize mint → "Base price (custom)"
 *   migrate $20 → $40: Autumn row is_custom, Stripe nickname is not
 */

import { expect, test } from "bun:test";
import type {
	AttachParamsV1Input,
	UpdatePlanParamsV2Input,
} from "@autumn/shared";
import { isFixedPrice, isPrepaidPrice } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { runMigrationInChunks } from "@/internal/migrations/v2/run/runMigrationInChunks.js";
import { generateId } from "@/utils/genUtils.js";
import { loadCustomerAndCatalogPrices } from "../misc/utils/findCatalogAndCustomPrices";
import { customerFixedStripePriceId } from "./utils/customerFixedStripePriceId";
import { expectStripePriceNickname } from "./utils/expectStripePriceNickname";

const updatePlanPriceInPlace = async ({
	autumn,
	planId,
	amount,
}: {
	autumn: Awaited<ReturnType<typeof initScenario>>["autumnV2_3"];
	planId: string;
	amount: number;
}) => {
	const body: UpdatePlanParamsV2Input = {
		plan_id: planId,
		disable_version: true,
		migration: { draft: true },
		price: itemsV2.monthlyPrice({ amount }),
	};
	const response = (await autumn.post("/plans.update", body)) as {
		migration?: { id: string };
		migrations?: { id: string }[];
	};
	const migrationId = response.migrations?.[0]?.id ?? response.migration?.id;
	if (!migrationId) throw new Error(`expected a catalog draft for ${planId}`);
	return migrationId;
};

test.concurrent(
	`${chalk.yellowBright("price nickname: catalog base / prepaid / usage")}`,
	async () => {
		const pro = products.pro({
			id: "nick-catalog-kinds",
			items: [
				items.prepaidMessages({ includedUsage: 100, billingUnits: 100 }),
				items.consumable({ featureId: TestFeature.Words }),
			],
		});

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "nick-catalog",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
		});

		const { catalogPrices } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});

		const nicknames: string[] = [];
		for (const price of catalogPrices) {
			const stripePriceId = isPrepaidPrice(price)
				? price.config.stripe_prepaid_price_v2_id
				: price.config.stripe_price_id;
			expect(stripePriceId).toBeTruthy();
			const stripePrice = await ctx.stripeCli.prices.retrieve(stripePriceId!);
			nicknames.push(stripePrice.nickname ?? "");
			if (isFixedPrice(price)) {
				expect(stripePrice.nickname).toBe("Base price");
			} else if (isPrepaidPrice(price)) {
				expect(stripePrice.nickname).toBe("Prepaid price (Messages)");
			} else {
				expect(stripePrice.nickname).toBe("Usage-based price (Words)");
			}
		}
		expect(nicknames).toContain("Base price");
		expect(nicknames).toContain("Prepaid price (Messages)");
		expect(nicknames).toContain("Usage-based price (Words)");
	},
);

test.concurrent(
	`${chalk.yellowBright("price nickname: customize mint is Base price (custom)")}`,
	async () => {
		const pro = products.pro({ id: "nick-custom-base", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "nick-custom",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		await autumnV2_3.billing.attach<AttachParamsV1Input>({
			customer_id: customerId,
			plan_id: pro.id,
			customize: { price: itemsV2.monthlyPrice({ amount: 25 }) },
		});

		const { customerStripePriceId } = await customerFixedStripePriceId({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		expect(customerStripePriceId).toBeTruthy();
		await expectStripePriceNickname({
			ctx,
			stripePriceId: customerStripePriceId!,
			nickname: "Base price (custom)",
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("price nickname: migrate $20 → $40 is_custom row is not (custom)")}`,
	async () => {
		const pro = products.pro({ id: "nick-migrate-base", items: [] });

		const { customerId, autumnV2_3, ctx } = await initScenario({
			customerId: "nick-migrate",
			setup: [
				s.customer({ testClock: false, paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.billing.attach({ productId: pro.id })],
		});

		const migrationId = await updatePlanPriceInPlace({
			autumn: autumnV2_3,
			planId: pro.id,
			amount: 40,
		});
		const [migration] = await migrationRepo.get({ ctx, id: migrationId });
		if (!migration) throw new Error(`Migration ${migrationId} not found`);
		await runMigrationInChunks({
			ctx,
			migration,
			migrationRunId: generateId("mrun"),
			dryRun: false,
		});

		const { customerPrices } = await loadCustomerAndCatalogPrices({
			ctx,
			customerId,
			catalogProductId: pro.id,
		});
		const customerFixed = customerPrices.find((price) => isFixedPrice(price));
		expect(customerFixed?.is_custom).toBe(true);
		expect(customerFixed?.config.stripe_price_id).toBeTruthy();
		await expectStripePriceNickname({
			ctx,
			stripePriceId: customerFixed!.config.stripe_price_id!,
			nickname: "Base price",
		});
	},
);
