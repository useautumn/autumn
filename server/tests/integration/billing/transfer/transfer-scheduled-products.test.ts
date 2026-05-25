import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const expectScopedProducts = async ({
	ctx,
	customerId,
	productIds,
	internalEntityId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
	productIds: string[];
	internalEntityId: string | null;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	const scopedProducts = fullCustomer.customer_products
		.filter((cusProduct) => productIds.includes(cusProduct.product.id))
		.map((cusProduct) => ({
			productId: cusProduct.product.id,
			status: cusProduct.status,
			internalEntityId: cusProduct.internal_entity_id,
		}))
		.sort((left, right) => left.productId.localeCompare(right.productId));

	expect(scopedProducts).toEqual([
		{
			productId: productIds[1],
			status: CusProductStatus.Scheduled,
			internalEntityId,
		},
		{
			productId: productIds[0],
			status: CusProductStatus.Active,
			internalEntityId,
		},
	]);
};

test.concurrent(
	`${chalk.yellowBright("transfer: scheduled plan follows customer plan to entity")}`,
	async () => {
		const customerId = "transfer-scheduled-to-entity";

		const pro = products.pro({
			id: "pro-to-entity",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium-to-entity",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, timeout: 0 }),
				s.billing.attach({
					productId: premium.id,
					planSchedule: "end_of_cycle",
					timeout: 0,
				}),
			],
		});

		const entityId = entities[0].id;
		await autumnV1.transfer(customerId, {
			to_entity_id: entityId,
			product_id: pro.id,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const targetEntity = fullCustomer.entities.find(
			(entity) => entity.id === entityId,
		);
		expect(targetEntity).toBeDefined();

		await expectScopedProducts({
			ctx,
			customerId,
			productIds: [pro.id, premium.id],
			internalEntityId: targetEntity!.internal_id,
		});
	},
	30000,
);

test.concurrent(
	`${chalk.yellowBright("transfer: scheduled plan follows entity plan to customer")}`,
	async () => {
		const customerId = "transfer-scheduled-to-customer";

		const pro = products.pro({
			id: "pro-to-customer",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const premium = products.premium({
			id: "premium-to-customer",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 0 }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					planSchedule: "end_of_cycle",
					timeout: 0,
				}),
			],
		});

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0].id,
			product_id: pro.id,
		});

		await expectScopedProducts({
			ctx,
			customerId,
			productIds: [pro.id, premium.id],
			internalEntityId: null,
		});
	},
	30000,
);
