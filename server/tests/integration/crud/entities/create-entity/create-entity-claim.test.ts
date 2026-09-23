import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/** An id-less entity holds a seat; the create that names it takes the row over, not a second seat. */
test.concurrent(
	`${chalk.yellowBright("create-entity-claim: naming the id-less entity claims it without a second seat")}`,
	async () => {
		const seats = items.freeUsers({ includedUsage: 5 });
		const perEntityMessages = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const pro = products.base({ items: [seats, perEntityMessages] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-entity-claim-1",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [s.attach({ productId: pro.id })],
		});

		const idless = await autumnV1.entities.create(customerId, {
			id: null,
			feature_id: TestFeature.Users,
		});
		expect(idless.autumn_id).toBeDefined();

		const claimed = await autumnV1.entities.create(customerId, {
			id: "user-1",
			name: "User 1",
			feature_id: TestFeature.Users,
		});
		expect(claimed.autumn_id).toBe(idless.autumn_id);
		expect(claimed.name).toBe("User 1");
		expect(claimed.features?.[TestFeature.Messages]?.balance).toBe(100);

		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(4);
		const { list } = (await autumnV1.entities.list(customerId)) as unknown as {
			list: ApiEntityV0[];
		};
		expect(list.length).toBe(1);

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			"user-1",
			{ skip_cache: "true" },
		);
		expect(entity.features?.[TestFeature.Messages]?.balance).toBe(100);

		await expectAutumnError({
			func: () =>
				autumnV1.entities.create(customerId, {
					id: "user-1",
					feature_id: TestFeature.Users,
				}),
		});
	},
);

/** An id-less entity of another feature is not claimed; the request inserts. */
test.concurrent(
	`${chalk.yellowBright("create-entity-claim: an id-less entity of another feature is left alone")}`,
	async () => {
		const seats = items.freeUsers({ includedUsage: 5 });
		const pro = products.base({ items: [seats] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "create-entity-claim-2",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [s.attach({ productId: pro.id })],
		});

		await autumnV1.entities.create(customerId, {
			id: null,
			feature_id: TestFeature.Workflows,
		});
		await autumnV1.entities.create(customerId, {
			id: "user-1",
			feature_id: TestFeature.Users,
		});

		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		const { list } = (await autumnV1.entities.list(customerId)) as unknown as {
			list: ApiEntityV0[];
		};
		expect(list.length).toBe(2);
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(4);
	},
);
