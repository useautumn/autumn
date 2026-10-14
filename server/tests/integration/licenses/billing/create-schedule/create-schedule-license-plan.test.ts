import { test } from "bun:test";
import { BillingInterval, ms } from "@autumn/shared";
import { expectLicenseDefinitionCorrect } from "@tests/integration/licenses/utils/expectLicenseDefinitionCorrect";
import { expectScheduledLicensePools } from "@tests/integration/licenses/utils/expectScheduledLicensePools";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

const CATALOG_SEAT_PRICE = 20;
const CUSTOM_SEAT_PRICE = 40;
const CATALOG_MESSAGES = 100;
const CUSTOM_MESSAGES = 500;
const INCLUDED_SEATS = 2;

const buildLicensePlans = ({ prefix }: { prefix: string }) => {
	const parent = products.base({
		id: `${prefix}-parent`,
		items: [items.dashboard()],
	});
	const seat = products.base({
		id: `${prefix}-seat`,
		items: [
			items.monthlyPrice({ price: CATALOG_SEAT_PRICE }),
			items.monthlyMessages({ includedUsage: CATALOG_MESSAGES }),
		],
		group: `${prefix}-seat-licenses`,
	});

	return { parent, seat };
};

test.concurrent(
	`${chalk.yellowBright("create-schedule-license: schedules a license-backed plan in a future phase")}`,
	async () => {
		const customerId = "create-schedule-license-plan";
		const starter = products.base({
			id: "csl-starter",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { parent: enterprise, seat } = buildLicensePlans({ prefix: "csl" });

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, enterprise, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: enterprise.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		await autumnV2_3.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: Date.now(), plans: [{ plan_id: starter.id }] },
				{
					starts_at: Date.now() + ms.months(1),
					plans: [{ plan_id: enterprise.id }],
				},
			],
		});

		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: enterprise.id,
			licenses: [{ licensePlanId: seat.id, granted: INCLUDED_SEATS }],
		});
	},
);

test.concurrent(
	`${chalk.yellowBright("create-schedule-license: accepts customize.upsert_licenses on a scheduled phase")}`,
	async () => {
		const customerId = "create-schedule-license-customize";
		const starter = products.base({
			id: "cslc-starter",
			items: [items.monthlyPrice({ price: 10 })],
		});
		const { parent: enterprise, seat } = buildLicensePlans({ prefix: "cslc" });

		const { autumnV2_3, ctx } = await initScenario({
			customerId,
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [starter, enterprise, seat] }),
			],
			actions: [
				s.licenses.link({
					parentProductId: enterprise.id,
					licenseProductId: seat.id,
					included: INCLUDED_SEATS,
				}),
			],
		});

		await autumnV2_3.billing.createSchedule({
			customer_id: customerId,
			phases: [
				{ starts_at: Date.now(), plans: [{ plan_id: starter.id }] },
				{
					starts_at: Date.now() + ms.months(1),
					plans: [
						{
							plan_id: enterprise.id,
							customize: {
								upsert_licenses: [
									{
										license_plan_id: seat.id,
										customize: {
											price: {
												amount: CUSTOM_SEAT_PRICE,
												interval: BillingInterval.Month,
											},
											remove_items: [{ feature_id: TestFeature.Messages }],
											add_items: [
												itemsV2.monthlyMessages({ included: CUSTOM_MESSAGES }),
											],
										},
									},
								],
							},
						},
					],
				},
			],
		});

		await expectScheduledLicensePools({
			ctx,
			customerId,
			parentPlanId: enterprise.id,
			licenses: [{ licensePlanId: seat.id, granted: INCLUDED_SEATS }],
		});

		await expectLicenseDefinitionCorrect({
			ctx,
			customerId,
			parentPlanId: enterprise.id,
			isCustom: true,
			isCustomized: true,
			basePrice: {
				amount: CUSTOM_SEAT_PRICE,
				interval: BillingInterval.Month,
				isCustom: true,
			},
		});
	},
);
