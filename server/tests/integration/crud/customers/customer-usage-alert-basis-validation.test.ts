/**
 * TDD test for usage alert `basis` / `filter` validation and round-trip.
 *
 * Contract under test:
 *   New types/fields:
 *     - usage_alerts[].basis defaults to "balance" and is echoed on reads
 *     - usage_alerts[].filter is echoed on reads (values canonicalised to strings)
 *   Validation:
 *     - filter without basis usage_limit → 400
 *     - duplicate (feature_id, basis, filterKey, threshold_type, threshold) → 400; differing basis accepted
 *     - basis usage_limit with no resolvable (feature_id, filter) limit → 400 on
 *       customers.update, entities.update and product create; resolves through
 *       customer-own, entity-own and plan limits
 *     - entity usage_limits dedup is filter-aware
 *     - org config rejects basis usage_limit
 *
 * Pre-impl red: basis/filter do not exist on the schema (compile), then the
 * validation rules are absent so updates succeed.
 */

import { expect, test } from "bun:test";
import {
	type ApiCustomerV5,
	type ApiEntityV2,
	ApiVersion,
	type EntityBillingControls,
	OrgConfigSchema,
	ResetInterval,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features.js";
import { expectAutumnError } from "@tests/utils/expectUtils/expectErrUtils.js";
import { items } from "@tests/utils/fixtures/items.js";
import { products } from "@tests/utils/fixtures/products.js";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario.js";
import chalk from "chalk";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

const autumnV2_3 = new AutumnInt({ version: ApiVersion.V2_3 });

const numericFilterValue = (value: number) => value as unknown as string;

const dailyLimit = (filter?: { properties: Record<string, string> }) => ({
	feature_id: TestFeature.Messages,
	enabled: true,
	limit: 200,
	interval: ResetInterval.Day as const,
	...(filter && { filter }),
});

const percentAlert = ({
	basis,
	threshold = 80,
	filter,
}: {
	basis?: "balance" | "included" | "recurring" | "usage_limit";
	threshold?: number;
	filter?: { properties: Record<string, string> };
} = {}) => ({
	feature_id: TestFeature.Messages,
	threshold,
	threshold_type: "usage_percentage" as const,
	enabled: true,
	...(basis && { basis }),
	...(filter && { filter }),
});

const setupCustomer = async (customerId: string, planId: string) => {
	const plan = products.base({
		id: planId,
		items: [items.monthlyMessages({ includedUsage: 1000 })],
	});
	return initScenario({
		customerId,
		setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
		actions: [s.attach({ productId: plan.id })],
	});
};

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation1: basis defaults to balance and round-trips with filter")}`,
	async () => {
		const customerId = "alert-basis-roundtrip-1";
		await setupCustomer(customerId, "alert-basis-roundtrip");

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_limits: [
					dailyLimit({ properties: { apiKeyId: numericFilterValue(123) } }),
				],
				usage_alerts: [
					percentAlert(),
					percentAlert({
						basis: "usage_limit",
						filter: { properties: { apiKeyId: numericFilterValue(123) } },
					}),
				],
			},
		});

		for (const skipCache of [false, true]) {
			const customer = await autumnV2_3.customers.get<ApiCustomerV5>(
				customerId,
				skipCache ? { skip_cache: "true" } : undefined,
			);
			const alerts = customer.billing_controls?.usage_alerts ?? [];
			expect(alerts).toHaveLength(2);
			expect(alerts[0].basis).toBe("balance");
			expect(alerts[0].filter).toBeUndefined();
			expect(alerts[1].basis).toBe("usage_limit");
			expect(alerts[1].filter).toEqual({ properties: { apiKeyId: "123" } });
		}
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation2: filter is only valid with basis usage_limit")}`,
	async () => {
		const customerId = "alert-basis-filter-only-ul-1";
		await setupCustomer(customerId, "alert-basis-filter-only-ul");

		await expectAutumnError({
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_alerts: [
							percentAlert({
								basis: "included",
								filter: { properties: { apiKeyId: "a" } },
							}),
						],
					},
				}),
		});
		await expectAutumnError({
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_alerts: [
							percentAlert({ filter: { properties: { apiKeyId: "a" } } }),
						],
					},
				}),
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation3: identity is (feature, basis, filter, type, threshold)")}`,
	async () => {
		const customerId = "alert-basis-identity-1";
		await setupCustomer(customerId, "alert-basis-identity");

		await expectAutumnError({
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_alerts: [percentAlert(), percentAlert({ basis: "balance" })],
					},
				}),
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_alerts: [
					percentAlert({ basis: "balance" }),
					percentAlert({ basis: "included" }),
				],
			},
		});
		const customer = await autumnV2_3.customers.get<ApiCustomerV5>(customerId);
		expect(customer.billing_controls?.usage_alerts).toHaveLength(2);
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation4: usage_limit alert needs a resolvable cap on customer or plan")}`,
	async () => {
		const customerId = "alert-basis-needs-limit-1";
		await setupCustomer(customerId, "alert-basis-needs-limit");

		await expectAutumnError({
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_alerts: [percentAlert({ basis: "usage_limit" })],
					},
				}),
		});

		await autumnV2_3.customers.update(customerId, {
			billing_controls: { usage_limits: [dailyLimit()] },
		});
		await expectAutumnError({
			func: () =>
				autumnV2_3.customers.update(customerId, {
					billing_controls: {
						usage_alerts: [
							percentAlert({
								basis: "usage_limit",
								filter: { properties: { apiKeyId: "a" } },
							}),
						],
					},
				}),
		});
		await autumnV2_3.customers.update(customerId, {
			billing_controls: {
				usage_alerts: [percentAlert({ basis: "usage_limit" })],
			},
		});

		const planCustomerId = "alert-basis-plan-limit-ok-1";
		const plan = products.base({
			id: "alert-basis-plan-limit-ok",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: { usage_limits: [dailyLimit()] },
		});
		await initScenario({
			customerId: planCustomerId,
			setup: [s.customer({ testClock: false }), s.products({ list: [plan] })],
			actions: [s.attach({ productId: plan.id })],
		});
		await autumnV2_3.customers.update(planCustomerId, {
			billing_controls: {
				usage_alerts: [percentAlert({ basis: "usage_limit" })],
			},
		});
		const customer =
			await autumnV2_3.customers.get<ApiCustomerV5>(planCustomerId);
		expect(customer.billing_controls?.usage_alerts?.[0]?.basis).toBe(
			"usage_limit",
		);
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation5: entity alerts accept basis/filter and entity limit dedup is filter-aware")}`,
	async () => {
		const customerId = "alert-basis-entity-1";
		const plan = products.base({
			id: "alert-basis-entity",
			items: [
				items.monthlyMessages({
					includedUsage: 1000,
					entityFeatureId: TestFeature.Users,
				}),
			],
		});
		const { entities } = await initScenario({
			customerId,
			setup: [
				s.customer({ testClock: false }),
				s.products({ list: [plan] }),
				s.entities({ count: 1, featureId: TestFeature.Users }),
			],
			actions: [s.attach({ productId: plan.id })],
		});
		const entityId = entities[0].id;

		await expectAutumnError({
			func: () =>
				autumnV2_3.entities.update(customerId, entityId, {
					billing_controls: {
						usage_alerts: [percentAlert({ basis: "usage_limit" })],
					} as EntityBillingControls,
				}),
		});

		await expectAutumnError({
			func: () =>
				autumnV2_3.entities.update(customerId, entityId, {
					billing_controls: {
						usage_limits: [
							dailyLimit({ properties: { apiKeyId: "a" } }),
							dailyLimit({ properties: { apiKeyId: "a" } }),
						],
					} as EntityBillingControls,
				}),
		});

		await autumnV2_3.entities.update(customerId, entityId, {
			billing_controls: {
				usage_limits: [
					dailyLimit(),
					dailyLimit({ properties: { apiKeyId: "a" } }),
				],
				usage_alerts: [
					percentAlert({ basis: "usage_limit" }),
					percentAlert({
						basis: "usage_limit",
						filter: { properties: { apiKeyId: "a" } },
					}),
				],
			} as EntityBillingControls,
		});
		const entity = await autumnV2_3.entities.get<ApiEntityV2>(
			customerId,
			entityId,
		);
		expect(entity.billing_controls?.usage_alerts).toHaveLength(2);
		expect(entity.billing_controls?.usage_alerts?.[1]?.filter).toEqual({
			properties: { apiKeyId: "a" },
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation6: a plan alert on basis usage_limit needs a plan cap")}`,
	async () => {
		const withoutLimit = products.base({
			id: "alert-basis-plan-no-limit",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_alerts: [percentAlert({ basis: "usage_limit" })],
			},
		});
		await expectAutumnError({
			func: () => autumnV2_3.products.create(withoutLimit),
		});

		const withLimit = products.base({
			id: "alert-basis-plan-with-limit",
			items: [items.monthlyMessages({ includedUsage: 1000 })],
			billingControls: {
				usage_limits: [dailyLimit()],
				usage_alerts: [percentAlert({ basis: "usage_limit" })],
			},
		});
		await initScenario({
			setup: [s.products({ list: [withLimit] })],
			actions: [],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("alert-basis-validation7: org config rejects basis usage_limit")}`,
	async () => {
		const rejected = OrgConfigSchema.safeParse({
			usage_alerts: [percentAlert({ basis: "usage_limit" })],
		});
		expect(rejected.success).toBe(false);

		const accepted = OrgConfigSchema.safeParse({
			sandbox_usage_alerts: [percentAlert({ basis: "included" })],
		});
		expect(accepted.success).toBe(true);
	},
);
