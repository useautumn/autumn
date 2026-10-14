import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

test(
	`${chalk.yellowBright("cancel by id: resolves entity-scoped cusProduct even without entity context")}`,
	async () => {
		const customerId = "cancel-entity-product-by-id";

		const messagesItem = items.monthlyMessages({ includedUsage: 100 });
		const priceItem = items.monthlyPrice({ price: 20 });
		const pro = products.base({
			id: "pro",
			items: [messagesItem, priceItem],
		});

		const { autumnV1, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
				s.entities({ count: 1, featureId: "users" }),
			],
			actions: [s.attach({ productId: pro.id, entityIndex: 0 })],
		});

		const fullCustomerBefore = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		const entityPro = fullCustomerBefore.customer_products.find(
			(cp) =>
				cp.product.id === pro.id &&
				cp.internal_entity_id &&
				cp.status === CusProductStatus.Active,
		);
		expect(entityPro).toBeDefined();

		await autumnV1.subscriptions.update({
			customer_id: customerId,
			customer_product_id: entityPro!.id,
			cancel_action: "cancel_immediately" as const,
		});

		const fullCustomerAfter = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});
		const activeEntityPro = fullCustomerAfter.customer_products.find(
			(cp) =>
				cp.id === entityPro!.id && cp.status === CusProductStatus.Active,
		);
		expect(activeEntityPro).toBeUndefined();
	},
);
