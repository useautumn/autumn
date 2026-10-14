/** biome-ignore-all lint/suspicious/noExplicitAny: test file */

import { test } from "bun:test";
import type { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 2: upgrade cancels scheduled downgrade")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-2";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: growth.id,
			status: "active" as unknown as CusProductStatus,
		});

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-upgrade-merged 3: upgrade cancels scheduled downgrade (both entities)")}`,
	async () => {
		const customerId = "legacy-upgrade-merged-3";

		const wordsItem = items.monthlyWords({ includedUsage: 100 });
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });
		const free = products.base({
			id: "free",
			items: [wordsItem],
		});
		const growth = products.growth({ id: "growth", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, free, premium, growth] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premium.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});

		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity2 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: growth.id,
			entity_id: entities[1].id,
		});

		entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2 as any,
			productId: growth.id,
			status: "active" as unknown as CusProductStatus,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1 as any,
			productId: premium.id,
			status: "active" as unknown as CusProductStatus,
		});
		expectProductAttached({
			customer: entity1 as any,
			productId: pro.id,
			status: "scheduled" as unknown as CusProductStatus,
		});
	},
);
