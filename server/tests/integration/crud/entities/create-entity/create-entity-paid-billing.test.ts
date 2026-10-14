import { expect, test } from "bun:test";
import { OnDecrease, OnIncrease } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { attachFailedPaymentMethod } from "@/external/stripe/stripeCusUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { timeout } from "@/utils/genUtils.js";
import { constructArrearProratedItem } from "@/utils/scriptUtils/constructItem.js";
import { expectSubQuantityCorrect } from "./utils/expectEntityUtils.js";

test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity1 - create/delete entities with billing")}`,
	async () => {
		const userItem = constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 50,
			includedUsage: 1,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({ items: [userItem] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-entity-paid-1",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		let usage = 0;

		const firstEntities = [
			{ id: "1", name: "test", feature_id: TestFeature.Users },
		];
		await autumnV1.entities.create(customerId, firstEntities);
		usage += 1;

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const entities = [
			{ id: "2", name: "test", feature_id: TestFeature.Users },
			{ id: "3", name: "test2", feature_id: TestFeature.Users },
		];
		await autumnV1.entities.create(customerId, entities);
		await timeout(3000);
		usage += entities.length;

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			itemQuantity: usage,
		});

		let customer = await autumnV1.customers.get(customerId);
		let invoices = customer.invoices!;
		expect(invoices.length).toBe(2);
		expect(invoices[0].total).toBe(userItem.price! * entities.length);

		await autumnV1.entities.delete(customerId, entities[0].id);

		customer = await autumnV1.customers.get(customerId);
		invoices = customer.invoices!;
		expect(invoices.length).toBe(2);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 1,
			itemQuantity: usage - 1,
		});

		const newEntities = [
			{ id: "4", name: "test3", feature_id: TestFeature.Users },
			{ id: "5", name: "test4", feature_id: TestFeature.Users },
		];
		await autumnV1.entities.create(customerId, newEntities);
		await timeout(3000);
		usage += 1;

		customer = await autumnV1.customers.get(customerId);
		invoices = customer.invoices!;

		expect(invoices.length).toBe(3);
		expect(invoices[0].total).toBe(userItem.price!);

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			itemQuantity: usage,
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-entity-paid: entity5 - payment failure handling")}`,
	async () => {
		const userItem = constructArrearProratedItem({
			featureId: TestFeature.Users,
			pricePerUnit: 50,
			includedUsage: 1,
			config: {
				on_increase: OnIncrease.BillImmediately,
				on_decrease: OnDecrease.None,
			},
		});

		const pro = products.pro({ items: [userItem] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-entity-paid-5",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [],
		});

		let usage = 0;

		const firstEntities = [
			{ id: "1", name: "test", feature_id: TestFeature.Users },
		];
		await autumnV1.entities.create(customerId, firstEntities);
		usage += firstEntities.length;

		await autumnV1.attach({
			customer_id: customerId,
			product_id: pro.id,
		});

		const fullCus = await CusService.getFull({
			ctx,
			idOrInternalId: customerId,
		});

		await attachFailedPaymentMethod({
			stripeCli: ctx.stripeCli,
			customer: fullCus,
		});

		await expectAutumnError({
			errMessage: "card was declined.",
			func: async () => {
				await autumnV1.entities.create(customerId, [
					{ id: "2", name: "test", feature_id: TestFeature.Users },
					{ id: "3", name: "test", feature_id: TestFeature.Users },
				]);
			},
		});

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 0,
		});

		await expectAutumnError({
			func: async () => {
				return await autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					value: 2,
				});
			},
		});

		await expectSubQuantityCorrect({
			stripeCli: ctx.stripeCli,
			productId: pro.id,
			db: ctx.db,
			org: ctx.org,
			env: ctx.env,
			customerId,
			usage,
			numReplaceables: 0,
		});
	},
);
