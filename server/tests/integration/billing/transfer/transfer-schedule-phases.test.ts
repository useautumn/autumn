import { expect, test } from "bun:test";
import { customerProducts, ms, schedulePhases } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import { getRequiredScheduleId } from "../create-schedule/utils/createScheduleTestHelpers";

const selectScopes = async ({
	ctx,
	customerProductIds,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	customerProductIds: string[];
}) =>
	await ctx.db
		.select({
			id: customerProducts.id,
			product_id: customerProducts.product_id,
			internal_entity_id: customerProducts.internal_entity_id,
		})
		.from(customerProducts)
		.where(inArray(customerProducts.id, customerProductIds));

const selectPhaseCustomerProductIds = async ({
	ctx,
	scheduleId,
}: {
	ctx: Awaited<ReturnType<typeof initScenario>>["ctx"];
	scheduleId: string;
}) => {
	const phases = await ctx.db
		.select()
		.from(schedulePhases)
		.where(eq(schedulePhases.schedule_id, scheduleId));
	return phases.flatMap((phase) => phase.customer_product_ids);
};

test.concurrent(
	`${chalk.yellowBright("transfer: later phases of the same plan follow it, unrelated plans stay")}`,
	async () => {
		const customerId = "transfer-schedule-phases-to-customer";

		const pro = products.pro({
			id: "pro-phases-to-customer",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const premium = products.premium({
			id: "premium-phases-to-customer",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
		});
		const addon = products.recurringAddOn({
			id: "addon-phases-to-customer",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium, addon] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const now = Date.now();

		const scheduleResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			entity_id: entityId,
			phases: [
				{ starts_at: now, plans: [{ plan_id: pro.id }] },
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id }, { plan_id: addon.id }],
				},
			],
		});

		const scheduleId = getRequiredScheduleId(scheduleResponse.schedule_id);
		const phaseCustomerProductIds = await selectPhaseCustomerProductIds({
			ctx,
			scheduleId,
		});
		expect(phaseCustomerProductIds.length).toBe(3);

		const openingCustomerProductId =
			scheduleResponse.phases[0]!.customer_product_ids[0]!;

		// The dashboard names the exact row it is transferring.
		await autumnV1.transfer(customerId, {
			from_entity_id: entityId,
			product_id: pro.id,
			customer_product_id: openingCustomerProductId,
		});

		const scopes = await selectScopes({
			ctx,
			customerProductIds: phaseCustomerProductIds,
		});
		expect(scopes).toHaveLength(3);

		for (const customerProduct of scopes) {
			if (customerProduct.product_id === addon.id) {
				// A different plan slot in the same schedule is left where it was.
				expect(customerProduct.internal_entity_id).not.toBeNull();
			} else {
				expect(customerProduct.internal_entity_id).toBeNull();
			}
		}
	},
	60000,
);

test.concurrent(
	`${chalk.yellowBright("transfer: a mixed-scope schedule only moves the transferred scope")}`,
	async () => {
		const customerId = "transfer-schedule-mixed-scope";

		const pro = products.pro({
			id: "pro-mixed-scope",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});
		const addon = products.recurringAddOn({
			id: "addon-mixed-scope",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { autumnV1, ctx, entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const scopedEntityId = entities[0]!.id;
		const destinationEntityId = entities[1]!.id;
		const now = Date.now();

		// One plan at customer level, one pinned to an entity, in the same schedule.
		const scheduleResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [
						{ plan_id: pro.id, entity_id: null },
						{ plan_id: addon.id, entity_id: scopedEntityId },
					],
				},
				{ starts_at: now + ms.days(30), plans: [{ plan_id: pro.id }] },
			],
		});

		const phaseCustomerProductIds = await selectPhaseCustomerProductIds({
			ctx,
			scheduleId: getRequiredScheduleId(scheduleResponse.schedule_id),
		});

		const beforeTransfer = await selectScopes({
			ctx,
			customerProductIds: phaseCustomerProductIds,
		});
		const entityScopedProduct = beforeTransfer.find(
			(customerProduct) => customerProduct.product_id === addon.id,
		);
		expect(entityScopedProduct?.internal_entity_id).not.toBeNull();

		await autumnV1.transfer(customerId, {
			to_entity_id: destinationEntityId,
			product_id: pro.id,
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
		});
		const destinationEntity = fullCustomer.entities.find(
			(entity) => entity.id === destinationEntityId,
		);
		expect(destinationEntity).toBeDefined();

		const afterTransfer = await selectScopes({
			ctx,
			customerProductIds: phaseCustomerProductIds,
		});

		for (const customerProduct of afterTransfer) {
			if (customerProduct.product_id === addon.id) {
				expect(customerProduct.internal_entity_id).toBe(
					entityScopedProduct!.internal_entity_id,
				);
			} else {
				expect(customerProduct.internal_entity_id).toBe(
					destinationEntity!.internal_id,
				);
			}
		}
	},
	60000,
);
