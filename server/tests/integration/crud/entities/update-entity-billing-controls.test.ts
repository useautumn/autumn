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

const usageAlertControls: EntityBillingControls = {
	usage_alerts: [
		{
			feature_id: TestFeature.Messages,
			threshold: 80,
			threshold_type: "usage_percentage",
			enabled: true,
		},
	],
};

const overageAllowedControls: EntityBillingControls = {
	overage_allowed: [
		{
			feature_id: TestFeature.Messages,
			enabled: true,
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

test.concurrent(`${chalk.yellowBright("entity billing controls: create entity with usage alerts")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-4",
		setup: [s.customer({})],
		actions: [],
	});

	const created = await autumnV2_1.entities.create(customerId, {
		id: "entity-ua-1",
		name: "Entity UA 1",
		feature_id: TestFeature.Users,
		billing_controls: usageAlertControls,
	});

	expect((created as ApiEntityV2).billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-ua-1",
	);

	expect(fetched.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: create entity with both spend limits and usage alerts")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-5",
		setup: [s.customer({})],
		actions: [],
	});

	const bothControls: EntityBillingControls = {
		...initialBillingControls,
		...usageAlertControls,
	};

	const created = await autumnV2_1.entities.create(customerId, {
		id: "entity-both-1",
		name: "Entity Both 1",
		feature_id: TestFeature.Users,
		billing_controls: bothControls,
	});

	expect((created as ApiEntityV2).billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
	expect((created as ApiEntityV2).billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: updating usage alerts does not unset spend limits")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-6",
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-preserve-1",
		name: "Entity Preserve 1",
		feature_id: TestFeature.Users,
		billing_controls: initialBillingControls,
	});

	// Update only usage_alerts
	await autumnV2_1.entities.update(customerId, "entity-preserve-1", {
		billing_controls: usageAlertControls,
	});

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-preserve-1",
	);

	// spend_limits should be preserved
	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
	// usage_alerts should be set
	expect(fetched.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);

	// Verify in DB too
	const fromDb = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const entity = fromDb.entities.find(
		(candidate) => candidate.id === "entity-preserve-1",
	);
	expect(entity?.spend_limits).toEqual(initialBillingControls.spend_limits);
	expect(entity?.usage_alerts).toEqual(usageAlertControls.usage_alerts);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: updating spend limits does not unset usage alerts")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-7",
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-preserve-2",
		name: "Entity Preserve 2",
		feature_id: TestFeature.Users,
		billing_controls: usageAlertControls,
	});

	// Update only spend_limits
	await autumnV2_1.entities.update(customerId, "entity-preserve-2", {
		billing_controls: initialBillingControls,
	});

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-preserve-2",
	);

	// usage_alerts should be preserved
	expect(fetched.billing_controls?.usage_alerts).toEqual(
		usageAlertControls.usage_alerts,
	);
	// spend_limits should be set
	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: clearing usage alerts with empty array")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-8",
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-clear-ua-1",
		name: "Entity Clear UA 1",
		feature_id: TestFeature.Users,
		billing_controls: {
			...initialBillingControls,
			...usageAlertControls,
		},
	});

	// Clear usage_alerts
	await autumnV2_1.entities.update(customerId, "entity-clear-ua-1", {
		billing_controls: { usage_alerts: [] },
	});

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-clear-ua-1",
	);

	expect(fetched.billing_controls?.usage_alerts).toEqual([]);
	// spend_limits should still be intact
	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: create entity with overage_allowed")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-9",
		setup: [s.customer({})],
		actions: [],
	});

	const created = await autumnV2_1.entities.create(customerId, {
		id: "entity-oa-1",
		name: "Entity OA 1",
		feature_id: TestFeature.Users,
		billing_controls: overageAllowedControls,
	});

	expect((created as ApiEntityV2).billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-oa-1",
	);
	expect(fetched.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: update overage_allowed without clearing spend limits")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-10",
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-oa-preserve-1",
		name: "Entity OA Preserve 1",
		feature_id: TestFeature.Users,
		billing_controls: initialBillingControls,
	});

	await autumnV2_1.entities.update(customerId, "entity-oa-preserve-1", {
		billing_controls: overageAllowedControls,
	});

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-oa-preserve-1",
	);
	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
	expect(fetched.billing_controls?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);

	const fromDb = await CusService.getFull({
		ctx,
		idOrInternalId: customerId,
		withEntities: true,
	});
	const entity = fromDb.entities.find(
		(candidate) => candidate.id === "entity-oa-preserve-1",
	);
	expect(entity?.spend_limits).toEqual(initialBillingControls.spend_limits);
	expect(entity?.overage_allowed).toEqual(
		overageAllowedControls.overage_allowed,
	);
});

test.concurrent(`${chalk.yellowBright("entity billing controls: reject duplicate overage_allowed feature ids")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-11",
		setup: [s.customer({})],
		actions: [],
	});

	await expectAutumnError({
		func: async () =>
			await autumnV2_1.entities.create(customerId, {
				id: "entity-oa-dup",
				name: "Entity OA Dup",
				feature_id: TestFeature.Users,
				billing_controls: {
					overage_allowed: [
						{ feature_id: TestFeature.Messages, enabled: true },
						{ feature_id: TestFeature.Messages, enabled: false },
					],
				},
			}),
	});
});

test.concurrent(`${chalk.yellowBright("entity billing controls: clearing overage_allowed with empty array")}`, async () => {
	const { customerId, autumnV2_1 } = await initScenario({
		customerId: "entity-billing-controls-12",
		setup: [s.customer({})],
		actions: [],
	});

	await autumnV2_1.entities.create(customerId, {
		id: "entity-oa-clear-1",
		name: "Entity OA Clear 1",
		feature_id: TestFeature.Users,
		billing_controls: {
			...initialBillingControls,
			...overageAllowedControls,
		},
	});

	await autumnV2_1.entities.update(customerId, "entity-oa-clear-1", {
		billing_controls: { overage_allowed: [] },
	});

	const fetched = await autumnV2_1.entities.get<ApiEntityV2>(
		customerId,
		"entity-oa-clear-1",
	);
	expect(fetched.billing_controls?.overage_allowed).toEqual([]);
	expect(fetched.billing_controls?.spend_limits).toEqual(
		initialBillingControls.spend_limits,
	);
});
