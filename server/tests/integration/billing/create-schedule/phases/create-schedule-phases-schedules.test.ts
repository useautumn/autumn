import { expect, test } from "bun:test";
import {
	CusProductStatus,
	customerProducts,
	ms,
	schedulePhases,
	schedules,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, inArray } from "drizzle-orm";
import { CusService } from "@/internal/customers/CusService";
import {
	getFullCustomerSchedule,
	hydrateCustomerWithSchedules,
} from "@/internal/customers/cusUtils/getFullCustomerSchedule";
import { getRequiredScheduleId } from "../utils/createScheduleTestHelpers";

test.concurrent(
	`${chalk.yellowBright("create-schedule: hydrates schedules on the full customer")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-hydrate-customer",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();
		const response = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		const fullCustomer = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
			withEntities: true,
			expand: [],
		});
		const hydratedCustomer = await hydrateCustomerWithSchedules({
			ctx,
			fullCustomer,
		});

		expect(hydratedCustomer.schedule?.id).toBe(
			getRequiredScheduleId(response.schedule_id),
		);
		expect(hydratedCustomer.schedule?.customer_id).toBe(customerId);
		expect(hydratedCustomer.schedule?.phases).toHaveLength(2);
		expect(hydratedCustomer.schedule?.phases[0]?.starts_at).toBe(now);
		expect(hydratedCustomer.schedule?.phases[1]?.starts_at).toBe(
			now + ms.days(30),
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: adding a future phase to an existing single-phase schedule persists both phases")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const premium = products.premium({
			id: "premium",
			items: [items.monthlyMessages({ includedUsage: 500 })],
		});

		const { customerId, autumnV1, ctx } = await initScenario({
			customerId: "create-schedule-add-future-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, premium] }),
			],
			actions: [],
		});

		const now = Date.now();
		const initialResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		expect(initialResponse.phases).toHaveLength(1);
		expect(initialResponse.phases[0]!.customer_product_ids).toHaveLength(1);

		const initialDbPhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(initialResponse.schedule_id),
				),
			);
		expect(initialDbPhases).toHaveLength(1);

		const updatedResponse = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: premium.id }],
				},
			],
		});

		expect(updatedResponse.phases).toHaveLength(2);
		expect(updatedResponse.phases[0]!.starts_at).toBe(now);
		expect(updatedResponse.phases[0]!.customer_product_ids).toHaveLength(1);
		expect(updatedResponse.phases[1]!.starts_at).toBe(now + ms.days(30));
		expect(updatedResponse.phases[1]!.customer_product_ids).toHaveLength(1);

		const updatedDbPhases = await ctx.db
			.select()
			.from(schedulePhases)
			.where(
				eq(
					schedulePhases.schedule_id,
					getRequiredScheduleId(updatedResponse.schedule_id),
				),
			);
		expect(updatedDbPhases).toHaveLength(2);

		const immediateProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(
					customerProducts.id,
					updatedResponse.phases[0]!.customer_product_ids,
				),
			);
		expect(immediateProducts).toHaveLength(1);
		expect(immediateProducts[0]!.status).toBe(CusProductStatus.Active);

		const futureProducts = await ctx.db
			.select()
			.from(customerProducts)
			.where(
				inArray(
					customerProducts.id,
					updatedResponse.phases[1]!.customer_product_ids,
				),
			);
		expect(futureProducts).toHaveLength(1);
		expect(futureProducts[0]!.status).toBe(CusProductStatus.Scheduled);
		expect(futureProducts[0]!.product_id).toBe(premium.id);
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule: customer-level and entity-level schedules coexist independently")}`,
	async () => {
		const pro = products.pro({
			id: "pro",
			items: [items.monthlyMessages({ includedUsage: 100 })],
		});
		const addon = products.recurringAddOn({
			id: "addon",
			items: [items.monthlyWords({ includedUsage: 25 })],
		});

		const { customerId, autumnV1, ctx, entities } = await initScenario({
			customerId: "create-schedule-entity-coexist",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro, addon] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [],
		});

		const entityId = entities[0]!.id;
		const now = Date.now();

		const customerSchedule = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: pro.id }],
				},
			],
		});

		const entitySchedule = await autumnV1.billing.createSchedule({
			customer_id: customerId,
			entity_id: entityId,
			phases: [
				{
					starts_at: now,
					plans: [{ plan_id: addon.id }],
				},
				{
					starts_at: now + ms.days(30),
					plans: [{ plan_id: addon.id }],
				},
			],
		});

		expect(customerSchedule.schedule_id).not.toBe(entitySchedule.schedule_id);

		const dbSchedules = await ctx.db
			.select()
			.from(schedules)
			.where(eq(schedules.customer_id, customerId));
		expect(dbSchedules).toHaveLength(2);

		const customerLevelSchedule = dbSchedules.find(
			(s) => !s.internal_entity_id,
		);
		const entityLevelSchedule = dbSchedules.find((s) => !!s.internal_entity_id);
		expect(customerLevelSchedule).toBeDefined();
		expect(entityLevelSchedule).toBeDefined();
		expect(entityLevelSchedule!.entity_id).toBe(entityId);

		const customerScopedSchedule = await getFullCustomerSchedule({
			ctx,
			internalCustomerId: dbSchedules[0]!.internal_customer_id,
		});

		expect(customerScopedSchedule?.id).toBe(customerLevelSchedule!.id);
		expect(customerScopedSchedule?.internal_entity_id).toBeNull();
	},
);
