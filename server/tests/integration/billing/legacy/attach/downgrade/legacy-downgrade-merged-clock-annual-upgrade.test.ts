// Legacy V1 attach downgrade behavior with test clock advancement (migrated from
// server/tests/merged/downgrade).

import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { expectProductAttached } from "@tests/utils/expectUtils/expectProductAttached";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8: Mixed annual + monthly downgrade, advance clock, then upgrade
// (from mergedDowngrade9)
//
// Ops: PremiumAnnual(ent1), Premium(ent2), Pro(ent1→sched), Pro(ent2→sched)
// Advance clock → ent1=PremiumAnnual+Pro(sched), ent2=Pro(active)
// Then upgrade ent2 back to Premium
// ═══════════════════════════════════════════════════════════════════════════════

test.concurrent(
	`${chalk.yellowBright("legacy-dg-clock 3: annual + monthly downgrade, advance clock, upgrade")}`,
	async () => {
		const customerId = "legacy-dg-clock-3";

		const wordsItem = items.consumableWords();
		const premiumAnnualItem = items.annualPrice({ price: 500 });
		const premiumAnnual = products.base({
			id: "premiumAnnual",
			items: [wordsItem, premiumAnnualItem],
		});
		const premium = products.premium({ id: "premium", items: [wordsItem] });
		const pro = products.pro({ id: "pro", items: [wordsItem] });

		// Setup: PremiumAnnual(ent1), Premium(ent2), Pro(ent1→sched), Pro(ent2→sched), advance clock
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
				s.attach({ productId: pro.id, entityIndex: 0 }),
				s.attach({ productId: pro.id, entityIndex: 1 }),
				s.advanceToNextInvoice(),
			],
		});

		// Entity 1: PremiumAnnual still active + Pro still scheduled (annual hasn't ended)
		const entity1 = await autumnV1.entities.get(customerId, entities[0].id);
		expectProductAttached({
			customer: entity1,
			productId: premiumAnnual.id,
			status: CusProductStatus.Active,
		});
		expectProductAttached({
			customer: entity1,
			productId: pro.id,
			status: CusProductStatus.Scheduled,
		});
		expect(
			entity1.products.filter((p: any) => p.group === premium.group).length,
		).toBe(2);

		// Entity 2: Pro active (monthly schedule activated)
		let entity2 = await autumnV1.entities.get(customerId, entities[1].id);
		expectProductAttached({
			customer: entity2,
			productId: pro.id,
			status: CusProductStatus.Active,
		});
		expect(
			entity2.products.filter((p: any) => p.group === premium.group).length,
		).toBe(1);

		// Upgrade entity 2 back to Premium
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
	},
);
