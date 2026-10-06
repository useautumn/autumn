import { test } from "bun:test";
import {
	expectProductActive,
	expectProductCanceling,
	expectProductNotPresent,
} from "@tests/integration/billing/utils/expectCustomerProductCorrect";
import { expectSubToBeCorrect } from "@tests/merged/mergeUtils/expectSubCorrect";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { advanceToNextInvoice } from "@tests/utils/testAttachUtils/testAttachUtils.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";

// Three entities - entity 1 annual downgrade, entity 2 monthly downgrade, entity 3 updates items
test.concurrent(`${chalk.yellowBright("schedules-p2p: annual + monthly downgrades, update entity 3")}`, async () => {
	const customerId = "sched-p2p-multi-downgrade";

	const consumableItem = items.consumableMessages({ includedUsage: 50 });

	// Premium annual ($500/yr)
	const premiumAnnual = constructProduct({
		id: "premium-annual",
		items: [consumableItem],
		type: "premium",
		isAnnual: true,
		isDefault: false,
	});

	// Premium monthly ($50/mo)
	const premium = constructProduct({
		id: "premium",
		items: [consumableItem],
		type: "premium",
		isDefault: false,
	});

	// Pro monthly ($20/mo)
	const pro = products.pro({
		id: "pro",
		items: [consumableItem],
	});

	const { autumnV1, ctx, entities, testClockId } = await initScenario({
		customerId,
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [premiumAnnual, premium, pro] }),
			s.entities({ count: 3, featureId: TestFeature.Users }),
		],
		actions: [
			s.attach({ productId: premiumAnnual.id, entityIndex: 0 }),
			s.attach({ productId: premium.id, entityIndex: 1 }),
			s.attach({ productId: premium.id, entityIndex: 2 }),
		],
	});

	// Entity 1 downgrades from Premium Annual to Pro (scheduled for end of annual period)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[0].id,
	});

	// Entity 2 downgrades from Premium Monthly to Pro (scheduled for end of month)
	await autumnV1.attach({
		customer_id: customerId,
		product_id: pro.id,
		entity_id: entities[1].id,
	});

	// Entity 3 updates Premium items to different price
	const newPriceItem = items.monthlyPrice({ price: 70 }); // $70/mo
	const newConsumable = items.consumableMessages({ includedUsage: 100 });

	await autumnV1.subscriptions.update({
		customer_id: customerId,
		entity_id: entities[2].id,
		product_id: premium.id,
		items: [newConsumable, newPriceItem],
	});

	// Verify entity 3's premium still active
	const entity3Data = await autumnV1.entities.get(customerId, entities[2].id);
	await expectProductActive({
		customer: entity3Data,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});

	// Advance to next billing cycle (monthly entities should downgrade)
	await advanceToNextInvoice({
		stripeCli: ctx.stripeCli,
		testClockId: testClockId!,
	});

	// After monthly cycle:
	// Entity 1: Still on Premium Annual (annual hasn't ended yet)
	// Entity 2: Now on Pro (monthly downgrade completed)
	// Entity 3: Still on Premium with updated items
	const entity1AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[0].id,
	);
	const entity2AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[1].id,
	);
	const entity3AfterCycle = await autumnV1.entities.get(
		customerId,
		entities[2].id,
	);

	// Entity 1 should still have premium-annual (annual cycle not over)
	await expectProductCanceling({
		customer: entity1AfterCycle,
		productId: premiumAnnual.id,
	});

	// Entity 2 should be on pro now
	await expectProductNotPresent({
		customer: entity2AfterCycle,
		productId: premium.id,
	});
	await expectProductActive({
		customer: entity2AfterCycle,
		productId: pro.id,
	});

	// Entity 3 should still have premium
	await expectProductActive({
		customer: entity3AfterCycle,
		productId: premium.id,
	});

	await expectSubToBeCorrect({
		db: ctx.db,
		customerId,
		org: ctx.org,
		env: ctx.env,
	});
});
