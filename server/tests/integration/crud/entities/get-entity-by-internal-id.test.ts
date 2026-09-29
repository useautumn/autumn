/**
 * An id-less entity is read by its internal id, as the dashboard reads a pending entity, on both balance routes.
 *
 * Red (before): the balance worker route answered 500 `entity_subject_required`; legacy answered the entity.
 * Green (after): both answer the entity with its features.
 */

import { expect, test } from "bun:test";
import type { ApiEntityV0 } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";

test.concurrent(
	`${chalk.yellowBright("get-entity-by-internal-id1: an id-less entity is read by its internal id")}`,
	async () => {
		const seats = items.freeUsers({ includedUsage: 5 });
		const perEntityMessages = items.monthlyMessages({
			includedUsage: 100,
			entityFeatureId: TestFeature.Users,
		});
		const plan = products.base({ items: [seats, perEntityMessages] });

		const { customerId, autumnV1 } = await initScenario({
			customerId: "get-entity-by-internal-id1",
			setup: [s.customer({}), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});
		const idless = await autumnV1.entities.create(customerId, {
			id: null,
			feature_id: TestFeature.Users,
		});

		const entity = await autumnV1.entities.get<ApiEntityV0>(
			customerId,
			idless.autumn_id,
		);

		expect(entity.features?.[TestFeature.Messages]).toBeDefined();
	},
);
