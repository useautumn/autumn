import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

/** entity_data creates the entity like entities.create: it uses a seat and gets its per-entity grants. */
test.concurrent(
	`${chalk.yellowBright("check-entity-data: auto-created entity uses a seat and is granted its per-entity balance")}`,
	async () => {
		const seats = items.freeUsers({ includedUsage: 5 });
		const perEntityMessages = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const pro = products.base({ items: [seats, perEntityMessages] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "check-entity-data-1",
			setup: [s.customer({}), s.products({ list: [pro] })],
			actions: [s.attach({ productId: pro.id })],
		});

		const { balance } = await autumnV1.check({
			customer_id: customerId,
			feature_id: TestFeature.Messages,
			entity_id: "user-1",
			entity_data: { feature_id: TestFeature.Users, name: "User 1" },
		});
		expect(balance).toBe(100);

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			"user-1",
			{ skip_cache: "true" },
		);
		expect(entity.name).toBe("User 1");
		expect(entity.features?.[TestFeature.Messages]?.balance).toBe(100);

		const customer = await autumnV1.customers.get(customerId, {
			skip_cache: "true",
		});
		expect(customer.features?.[TestFeature.Users]?.balance).toBe(4);
	},
);

/** Auto-creation never charges a seat. */
test.concurrent(
	`${chalk.yellowBright("check-entity-data: a paid feature is refused")}`,
	async () => {
		const paidSeats = items.allocatedUsers({ includedUsage: 1 });
		const pro = products.pro({ items: [paidSeats] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "check-entity-data-2",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [pro] }),
			],
			actions: [s.attach({ productId: pro.id })],
		});

		await expectAutumnError({
			errCode: "invalid_inputs",
			func: () =>
				autumnV1.track({
					customer_id: customerId,
					feature_id: TestFeature.Users,
					entity_id: "user-1",
					entity_data: { feature_id: TestFeature.Users },
				}),
		});

		await expectAutumnError({
			errCode: "entity_not_found",
			func: () =>
				autumnV1.entities.get(customerId, "user-1", { skip_cache: "true" }),
		});
	},
);
