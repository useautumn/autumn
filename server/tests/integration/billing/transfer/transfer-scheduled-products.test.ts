import { expect, test } from "bun:test";
import { CusProductStatus, ms } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService";
import { getAllCustomerSchedules } from "@/internal/customers/cusUtils/getFullCustomerSchedule";

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

// Pre-fix: the UI request moved only the active phase and left the customer schedule behind.
// Post-fix: every related phase and the persisted schedule move to the target entity.
test.concurrent(
	`${chalk.yellowBright("transfer: frontend request moves a three-phase schedule to an entity")}`,
	async () => {
		const customerId = "transfer-three-phase-schedule-to-entity";
		const pro = products.pro({
			id: "transfer-phase-one",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "transfer-phase-two",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const growth = products.growth({
			id: "transfer-phase-three",
			items: [items.monthlyMessages({ includedUsage: 1500 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, growth] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const now = Date.now();
		await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
				{
					starts_at: now + ms.days(60),
					plans: [{ plan_id: growth.id }],
				},
			],
		});

		const beforeTransfer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const activeProduct = beforeTransfer.customer_products.find(
			(customerProduct) => customerProduct.product.id === pro.id,
		);
		const targetEntity = beforeTransfer.entities.find(
			(entity) => entity.id === entities[0].id,
		);
		expect(activeProduct).toBeDefined();
		expect(targetEntity).toBeDefined();

		await autumnV1.post(`/customers/${customerId}/transfer`, {
			customer_product_id: activeProduct!.id,
			to_entity_id: targetEntity!.internal_id,
			product_id: pro.id,
		});

		const afterTransfer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const transferredProducts = afterTransfer.customer_products.filter(
			(customerProduct) =>
				[pro.id, premium.id, growth.id].includes(customerProduct.product.id),
		);
		expect(transferredProducts).toHaveLength(3);
		expect(
			transferredProducts.every(
				(customerProduct) =>
					customerProduct.internal_entity_id === targetEntity!.internal_id,
			),
		).toBe(true);

		const [schedule] = await getAllCustomerSchedules({
			ctx,
			internalCustomerId: afterTransfer.internal_id,
		});
		expect(schedule?.internal_entity_id).toBe(targetEntity!.internal_id);
		expect(schedule?.phases).toHaveLength(3);
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
