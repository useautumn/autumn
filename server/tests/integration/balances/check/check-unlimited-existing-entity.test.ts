import { test } from "bun:test";
import type { ProductItem } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import { expectUnlimitedEntityCheck } from "../utils/expectUnlimitedEntityCheck.js";

// Before entity-map initialization, adding a second entity denies the existing entity.
// Both entities must retain access to the unlimited entitlement.
test.concurrent(
	"check-unlimited-existing-entity: adding an entity preserves access for an entity created before attachment",
	async () => {
		const unlimitedMessages: ProductItem = {
			...items.unlimitedMessages(),
			entity_feature_id: TestFeature.Users,
		};
		const product = products.base({
			id: "unlimited-entity-access",
			items: [unlimitedMessages],
		});
		const { customerId, autumnV2_4, entities } = await initScenario({
			customerId: "check-unlimited-existing-entity",
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [product] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: product.id })],
		});

		await expectUnlimitedEntityCheck({
			autumn: autumnV2_4,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
		});

		await autumnV2_4.entities.create(customerId, {
			id: "entity-b",
			feature_id: TestFeature.Users,
		});

		await expectUnlimitedEntityCheck({
			autumn: autumnV2_4,
			customerId,
			entityId: entities[0].id,
			featureId: TestFeature.Messages,
		});
		await expectUnlimitedEntityCheck({
			autumn: autumnV2_4,
			customerId,
			entityId: "entity-b",
			featureId: TestFeature.Messages,
		});
	},
);
