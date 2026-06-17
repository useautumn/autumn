/**
 * TDD: free trials must be deduplicated per-entity, not per-customer.
 *
 * Catalog (anonymised from a real sandbox customer): a no-price "trial" plan
 * with a 30-day free trial (card_required: false, unique_fingerprint: false)
 * and two metered items. "users" is the entity feature (seats).
 *
 * Red-failure mode (current behavior):
 *  - getByFingerprint dedups on (customer, product) ignoring internal_entity_id.
 *  - Only the FIRST entity to attach the trial gets free_trial_id / trial_ends_at.
 *    Every later entity resolves "not trialing -> no trial".
 *  - A customer-level trial also burns the first entity's trial.
 *
 * Green-success criteria (after fix):
 *  - Each entity gets exactly one trial of its own.
 *  - A customer-level trial does NOT burn an entity's trial.
 *  - Once an entity has trialed, re-attaching the trial plan to that same
 *    entity does NOT re-grant (historical per-entity dedup).
 */

import { expect, test } from "bun:test";
import {
	ALL_STATUSES,
	CusProductStatus,
	FreeTrialDuration,
	type FullCusProduct,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const trialItems = [
	items.monthlyCredits({ includedUsage: 25 }),
	items.unlimitedMessages(),
];

const activeTrialForEntity = async ({
	customerId,
	entityId,
}: {
	customerId: string;
	entityId: string;
}): Promise<FullCusProduct | undefined> => {
	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		inStatuses: ALL_STATUSES,
	});

	return fullCustomer.customer_products.find(
		(cp) =>
			cp.entity_id === entityId && cp.status === CusProductStatus.Active,
	);
};

test.concurrent(
	`${chalk.yellowBright("entity-trials: each entity gets its own free trial")}`,
	async () => {
		const customerId = "entity-scoped-trials-each";
		const trial = products.baseWithTrial({
			id: "trial",
			items: trialItems,
			trialDays: 30,
			cardRequired: false,
		});

		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [trial] }),
				s.entities({ count: 3, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: trial.id, entityIndex: 0 }),
				s.billing.attach({ productId: trial.id, entityIndex: 1 }),
				s.billing.attach({ productId: trial.id, entityIndex: 2 }),
			],
		});

		for (const entity of entities) {
			const trialProduct = await activeTrialForEntity({
				customerId,
				entityId: entity.id,
			});

			expect(
				trialProduct,
				`No active trial product for ${entity.id}`,
			).toBeDefined();
			expect(
				trialProduct?.free_trial_id,
				`Entity ${entity.id} should have a free trial granted`,
			).not.toBeNull();
			expect(
				trialProduct?.trial_ends_at,
				`Entity ${entity.id} should have a trial end date`,
			).not.toBeNull();
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("entity-trials: customer-level trial does NOT burn an entity's trial")}`,
	async () => {
		const customerId = "entity-scoped-trials-customer-level";
		const trial = products.baseWithTrial({
			id: "trial",
			items: trialItems,
			trialDays: 30,
			cardRequired: false,
		});

		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [trial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [
				// Customer-level (no entity) trial first...
				s.billing.attach({ productId: trial.id }),
				// ...then an entity attaches the same trial.
				s.billing.attach({ productId: trial.id, entityIndex: 0 }),
			],
		});

		const trialProduct = await activeTrialForEntity({
			customerId,
			entityId: entities[0].id,
		});

		expect(trialProduct, "No active trial product for entity").toBeDefined();
		expect(
			trialProduct?.free_trial_id,
			"A customer-level trial must not burn the entity's trial",
		).not.toBeNull();
		expect(trialProduct?.trial_ends_at).not.toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("entity-trials: an entity that already trialed does not re-trial")}`,
	async () => {
		const customerId = "entity-scoped-trials-no-retrial";
		const trial = products.baseWithTrial({
			id: "trial",
			items: trialItems,
			trialDays: 30,
			cardRequired: false,
		});

		const { entities, autumnV1, autumnV2_3 } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [trial] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.billing.attach({ productId: trial.id, entityIndex: 0 })],
		});

		const entityId = entities[0].id;

		const firstTrial = await activeTrialForEntity({ customerId, entityId });
		expect(firstTrial?.free_trial_id, "First attach should trial").not.toBeNull();
		const productId = firstTrial!.product.id;

		// Free trial off, then back: cancel immediately and re-attach the same plan.
		await autumnV1.cancel({
			customer_id: customerId,
			product_id: productId,
			entity_id: entityId,
			cancel_immediately: true,
		});
		await autumnV2_3.billing.attach({
			customer_id: customerId,
			plan_id: productId,
			entity_id: entityId,
		});

		const reTrial = await activeTrialForEntity({ customerId, entityId });
		expect(reTrial, "No active trial product for entity").toBeDefined();
		expect(
			reTrial?.free_trial_id,
			"An entity that already trialed must not be re-granted a trial",
		).toBeNull();
	},
);

test.concurrent(
	`${chalk.yellowBright("entity-trials: unique_fingerprint still dedups across entities (device-level)")}`,
	async () => {
		const customerId = "entity-scoped-trials-fingerprint";
		const trial = products.base({
			id: "trial-fp",
			items: trialItems,
			freeTrial: {
				length: 30,
				duration: FreeTrialDuration.Day,
				cardRequired: false,
				uniqueFingerprint: true,
			},
		});

		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({
					testClock: false,
					data: { fingerprint: "device-shared-fp" },
				}),
				s.products({ list: [trial] }),
				s.entities({ count: 2, featureId: TestFeature.Users }),
			],
			actions: [
				s.billing.attach({ productId: trial.id, entityIndex: 0 }),
				s.billing.attach({ productId: trial.id, entityIndex: 1 }),
			],
		});

		const first = await activeTrialForEntity({
			customerId,
			entityId: entities[0].id,
		});
		const second = await activeTrialForEntity({
			customerId,
			entityId: entities[1].id,
		});

		expect(first?.free_trial_id, "First entity should trial").not.toBeNull();
		// unique_fingerprint is device-level abuse prevention, so it must keep
		// deduping across entities even though entity scoping is now applied.
		expect(
			second?.free_trial_id,
			"unique_fingerprint must still dedup across entities",
		).toBeNull();
	},
);
