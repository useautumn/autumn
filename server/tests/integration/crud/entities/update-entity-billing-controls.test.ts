import { expect, test } from "bun:test";
import type { ApiEntityV2, EntityBillingControls } from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { CusService } from "@/internal/customers/CusService.js";

const initialBillingControls: EntityBillingControls = {
	spend_limits: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
			overage_limit: 25,
		},
	],
};

test.concurrent(`${chalk.yellowBright("entity billing controls: create and update entity spend limits")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-1",
		setup: [s.customer({})],
		actions: [],
	});

	const created = await autumnV2_1.entities.create(customerId, {
		id: "entity-1",
		name: "Entity 1",
		feature_id: TestFeature.Users,
		billing_controls: initialBillingControls,
	});

	expect((created as ApiEntityV2).billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-1",
	);

	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);

	const updatedBillingControls: EntityBillingControls = {
		spend_limits: [
			{
				feature_id: TestFeature.Credits,
				enabled: false,
				overage_limit: 100,
			},
		],
	};

	await autumnV2_1.entities.update(customerId, "entity-1", {
		billing_controls: updatedBillingControls,
	});

	const updated = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-1",
	);

	expect(updated.billing_controls?.spend_limits).toEqual(
		updatedBillingControls.spend_limits,
	);

	const fromDb = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});

	const entity = fromDb.entities.find(
		(candidate) => candidate.id === "entity-1",
	);
	expect(entity?.spend_limits).toEqual(updatedBillingControls.spend_limits);

	await autumnV2_1.entities.update(customerId, "entity-1", {
		billing_controls: { spend_limits: [] },
	});

	const cleared = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-1",
	);

	expect(cleared.billing_controls?.spend_limits).toEqual([]);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: require feature_id when overage_limit is set")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-2",
		setup: [s.customer({})],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.entities.create(customerId, {
				id: "entity-2",
				name: "Entity 2",
				feature_id: TestFeature.Users,
				billing_controls: {
					spend_limits: [
						// @ts-expect-error
						{
							overage_limit: 10,
						},
					],
				},
			}),
	});
});

test.concurrent(`${chalk.yellowBright("entity billing controls: reject duplicate spend limit feature ids on create and update")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-3",
		setup: [s.customer({})],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.entities.create(customerId, {
				id: "entity-3",
				name: "Entity 3",
				feature_id: TestFeature.Users,
				billing_controls: {
					spend_limits: [
						{
							feature_id: TestFeature.Messages,
							enabled: true,
							overage_limit: 10,
						},
						{
							feature_id: TestFeature.Messages,
							enabled: false,
							overage_limit: 20,
						},
					],
				},
			}),
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-4",
		name: "Entity 4",
		feature_id: TestFeature.Users,
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.entities.update(customerId, "entity-4", {
				billing_controls: {
					spend_limits: [
						{
							feature_id: TestFeature.Credits,
							enabled: true,
							overage_limit: 15,
						},
						{
							feature_id: TestFeature.Credits,
							enabled: true,
							overage_limit: 30,
						},
					],
				},
			}),
	});
});
