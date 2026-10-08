import { expect, test } from "bun:test";
import {
	BillingInterval,
	BillingMethod,
	ms,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";
import { Decimal } from "decimal.js";
import {
	expectCloseToCents,
	expectPreviewToMatchCreateSchedule,
	proratedDelta,
} from "./utils/createSchedulePreviewUtils";

const annualPrepaidWords = ({ amount }: { amount: number }) => {
	const item = itemsV2.prepaidWords({
		amount,
		billingUnits: 100,
		included: 0,
	});

	return {
		...item,
		price: {
			...item.price,
			interval: BillingInterval.Year,
			billing_method: BillingMethod.Prepaid,
		},
	};
};

const monthlyPrepaidMessages = ({ amount }: { amount: number }) =>
	itemsV2.prepaidMessages({
		amount,
		billingUnits: 100,
		included: 0,
	});

test.concurrent(
	`${chalk.yellowBright("create-schedule preview 14: phase boundary prorates annual and monthly items independently")}`,
	async () => {
		const group = "preview-mixed-interval-phase";
		const phase1 = products.base({
			id: "preview-mixed-interval-phase-1",
			group,
			items: [items.monthlyMessages({ includedUsage: 1 })],
		});
		const phase2 = products.base({
			id: "preview-mixed-interval-phase-2",
			group,
			items: [items.monthlyWords({ includedUsage: 1 })],
		});

		const { customerId, autumnV1, advancedTo } = await initScenario({
			customerId: "create-schedule-preview-mixed-interval-phase",
			setup: [
				s.customer({ paymentMethod: "success" }),
				s.products({ list: [phase1, phase2] }),
			],
			actions: [],
		});

		const transitionAt = truncateMsToSecondPrecision(advancedTo + ms.days(15));
		const annualEnd = addMonths(advancedTo, 12).getTime();
		const monthlyEnd = addMonths(advancedTo, 1).getTime();
		const expectedNextCycleTotal = new Decimal(
			proratedDelta({
				oldAmount: 120,
				newAmount: 240,
				start: advancedTo,
				end: annualEnd,
				transitionAt,
			}),
		)
			.plus(
				proratedDelta({
					oldAmount: 10,
					newAmount: 20,
					start: advancedTo,
					end: monthlyEnd,
					transitionAt,
				}),
			)
			.toDecimalPlaces(2)
			.toNumber();

		await expectPreviewToMatchCreateSchedule({
			autumnV1,
			params: {
				customer_id: customerId,
				phases: [
					{
						starts_at: advancedTo,
						plans: [
							{
								plan_id: phase1.id,
								customize: {
									items: [
										annualPrepaidWords({ amount: 120 }),
										monthlyPrepaidMessages({ amount: 10 }),
									],
								},
								feature_quantities: [
									{ feature_id: TestFeature.Words, quantity: 100 },
									{ feature_id: TestFeature.Messages, quantity: 100 },
								],
							},
						],
					},
					{
						starts_at: transitionAt,
						plans: [
							{
								plan_id: phase2.id,
								customize: {
									items: [
										annualPrepaidWords({ amount: 240 }),
										monthlyPrepaidMessages({ amount: 20 }),
									],
								},
								feature_quantities: [
									{ feature_id: TestFeature.Words, quantity: 100 },
									{ feature_id: TestFeature.Messages, quantity: 100 },
								],
							},
						],
					},
				],
			},
			expectedTotal: 130,
			expectedLineItemTotals: [10, 120],
			assertPreview: (preview) => {
				expect(preview.next_cycle?.starts_at).toBe(transitionAt);
				expectCloseToCents({
					actual: preview.next_cycle?.total ?? 0,
					expected: expectedNextCycleTotal,
				});
				expect(preview.next_cycle?.line_items).toHaveLength(4);
			},
		});
	},
);
