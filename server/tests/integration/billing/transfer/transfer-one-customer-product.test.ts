import { expect, test } from "bun:test";
import { CusProductStatus } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";

const getCustomerProducts = async ({
	ctx,
	customerId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerId: string;
}) => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	return { fullCustomer, customerProducts: fullCustomer.customer_products };
};

test.concurrent(
	`${chalk.yellowBright("transfer: only the named plan moves, its scheduled successor stays")}`,
	async () => {
		const customerId = "transfer-one-leaves-scheduled";

		const pro = products.pro({
			id: "pro-one-leaves-scheduled",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium-one-leaves-scheduled",
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

		await autumnV1.transfer(customerId, {
			to_entity_id: entities[0]!.id,
			product_id: pro.id,
		});

		const { fullCustomer, customerProducts } = await getCustomerProducts({
			ctx,
			customerId,
		});
		const targetEntity = fullCustomer.entities.find(
			(entity) => entity.id === entities[0]!.id,
		);

		const movedPro = customerProducts.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);
		const scheduledPremium = customerProducts.find(
			(customerProduct) => customerProduct.product.id === premium.id,
		);

		expect(movedPro?.internal_entity_id).toBe(targetEntity!.internal_id);
		expect(scheduledPremium?.status).toBe(CusProductStatus.Scheduled);
		expect(scheduledPremium?.internal_entity_id).toBeNull();
	},
	30000,
);

test.concurrent(
	`${chalk.yellowBright("transfer: a scheduled plan moves to an entity that already has the same plan scheduled")}`,
	async () => {
		const customerId = "transfer-one-scheduled-no-conflict";

		const pro = products.pro({
			id: "pro-scheduled-no-conflict",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium-scheduled-no-conflict",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: pro.id, entityIndex: 0, timeout: 0 }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 0,
					planSchedule: "end_of_cycle",
					timeout: 0,
				}),
				s.billing.attach({ productId: pro.id, entityIndex: 1, timeout: 0 }),
				s.billing.attach({
					productId: premium.id,
					entityIndex: 1,
					planSchedule: "end_of_cycle",
					timeout: 0,
				}),
			],
		});

		const { fullCustomer } = await getCustomerProducts({ ctx, customerId });
		const [sourceEntity, targetEntity] = entities.map(
			(entity) =>
				fullCustomer.entities.find(
					(fullEntity) => fullEntity.id === entity.id,
				)!,
		);
		const scheduledAtSource = fullCustomer.customer_products.find(
			(customerProduct) =>
				customerProduct.product.id === premium.id &&
				customerProduct.internal_entity_id === sourceEntity!.internal_id,
		);
		expect(scheduledAtSource).toBeDefined();

		await autumnV1.transfer(customerId, {
			from_entity_id: entities[0]!.id,
			to_entity_id: entities[1]!.id,
			product_id: premium.id,
			customer_product_id: scheduledAtSource!.id,
		});

		const { customerProducts } = await getCustomerProducts({
			ctx,
			customerId,
		});
		const scopeOf = (customerProductId: string) =>
			customerProducts.find(
				(customerProduct) => customerProduct.id === customerProductId,
			)?.internal_entity_id;

		expect(scopeOf(scheduledAtSource!.id)).toBe(targetEntity!.internal_id);

		const proAtSource = customerProducts.find(
			(customerProduct) =>
				customerProduct.product.id === pro.id &&
				customerProduct.internal_entity_id === sourceEntity!.internal_id,
		);
		expect(proAtSource).toBeDefined();
	},
	60000,
);
