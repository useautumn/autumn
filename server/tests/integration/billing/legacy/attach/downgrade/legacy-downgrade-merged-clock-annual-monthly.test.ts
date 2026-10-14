import { test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("legacy-dg-clock 2: annual + monthly, advance clock activates schedule")}`,
	async () => {
		const customerId = "legacy-dg-clock-2";

		const wordsItem = items.consumableWords();
		const premiumAnnualItem = items.annualPrice({ price: 500 });
		const premiumAnnualProduct = products.base({
			id: "premiumAnnual",
			items: [wordsItem, premiumAnnualItem],
		});
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		const { autumnV1, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, premiumAnnualProduct] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.attach({ productId: premiumAnnualProduct.id, entityIndex: 0 }),
				s.attach({ productId: premium.id, entityIndex: 1 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1,
			productId: premiumAnnualProduct.id,
			status: CusProductStatus.Active,
		});

		const entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
			status: CusProductStatus.Active,
		});
	},
);
