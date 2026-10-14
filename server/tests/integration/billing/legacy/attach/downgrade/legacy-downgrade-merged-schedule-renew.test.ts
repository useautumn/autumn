import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import ctx from "@tests/utils/testInitUtils/createTestContext";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-dg-sched 1: downgrade 2 entities then renew")}`,
	async () => {
		const customerId = "legacy-dg-sched-1";

		const wordsItem = items.consumableWords();
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
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
		expectProductAttached({ customer: entity1, productId: premium.id });
		expectProductAttached({
			customer: entity1,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(2);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});

		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({ customer: entity2, productId: premium.id });
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: premium.id });
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
		});

		entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({ customer: entity2, productId: premium.id });
		expect(
			entity2.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("legacy-dg-sched 5: mixed annual + monthly downgrade then renew")}`,
	async () => {
		const customerId = "legacy-dg-sched-5";

		const wordsItem = items.consumableWords();
		const premiumAnnualItem = items.annualPrice({ price: 500 });
		const premiumAnnual = products.base({
			id: "premiumAnnual",
			items: [wordsItem, premiumAnnualItem],
		});
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, premiumAnnual] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
			],
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[0].id,
		});

		let entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({ customer: entity1, productId: premiumAnnual.id });
		expectProductAttached({
			customer: entity1,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
			entity_id: entities[1].id,
		});

		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({ customer: entity2, productId: premium.id });
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premiumAnnual.id,
			entity_id: entities[0].id,
		});

		entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1,
			productId: premiumAnnual.id,
			status: CusProductStatus.Active,
		});
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});

		await autumnV1.attach({
			customer_id: customerId,
			product_id: premium.id,
			entity_id: entities[1].id,
		});

		entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2,
			productId: premium.id,
			status: CusProductStatus.Active,
		});
		expect(
			entity2.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		await expectSubToBeCorrect({
			db: ctx.db,
			customerId,
			org: ctx.org,
			env: ctx.env,
		});
	},
);
