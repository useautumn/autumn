import { expect, test } from "bun:test";
import {
	type AttachPreviewResponse,
	BillingInterval,
	BillingMethod,
	type CreateScheduleParamsV0Input,
	ms,
} from "@autumn/shared";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { itemsV2 } from "@tests/utils/fixtures/itemsV2";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { addMonths } from "date-fns";

const previewCreateSchedule = async ({
	autumnV1,
	params,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
}): Promise<AttachPreviewResponse> =>
	await autumnV1.post("/billing.preview_create_schedule", params);

const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
const sortStrings = (values: string[]) => [...values].sort((a, b) => a.localeCompare(b));

const expectPreviewToMatchCreateSchedule = async ({
	autumnV1,
	params,
	expectedTotal,
	expectedLineItemTotals,
	assertPreview,
}: {
	autumnV1: Awaited<ReturnType<typeof initScenario>>["autumnV1"];
	params: CreateScheduleParamsV0Input;
	expectedTotal?: number;
	expectedLineItemTotals?: number[];
	assertPreview?: (preview: AttachPreviewResponse) => void;
}) => {
	const preview = await previewCreateSchedule({ autumnV1, params });

	if (expectedTotal !== undefined) {
		expect(preview.total).toBe(expectedTotal);
		expect(preview.subtotal).toBe(expectedTotal);
	}
	if (expectedLineItemTotals) {
		expect(
			sortNumbers(preview.line_items.map((lineItem) => lineItem.total)),
		).toEqual(sortNumbers(expectedLineItemTotals));
	}
	expect(
		preview.line_items.reduce((sum, lineItem) => sum + lineItem.total, 0),
	).toBe(preview.total);

	assertPreview?.(preview);

	const response = await autumnV1.billing.createSchedule(params);

	expect(response.status).toBe("created");
	expect(response.invoice?.total ?? 0).toBe(preview.total);
};

test.concurrent(`${chalk.yellowBright("create-schedule preview 1: immediate recurring plans match preview total")}`, async () => {
	const pro = products.pro({
		id: "preview-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const addon = products.recurringAddOn({
		id: "preview-addon",
		items: [items.monthlyWords({ includedUsage: 25 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-recurring",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, addon] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }, { plan_id: addon.id }],
				},
				{
					starts_at: advancedTo + ms.days(30),
					plans: [{ plan_id: pro.id }],
				},
			],
		},
		expectedTotal: 40,
		expectedLineItemTotals: [20, 20],
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 2: prepaid feature quantities bill immediately")}`, async () => {
	const prepaid = products.base({
		id: "preview-prepaid",
		items: [items.prepaidMessages()],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: prepaid.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 400,
								},
							],
						},
					],
				},
			],
		},
		expectedTotal: 40,
		expectedLineItemTotals: [40],
		assertPreview: (preview) => {
			expect(preview.line_items).toContainEqual(
				expect.objectContaining({
					feature_id: TestFeature.Messages,
					quantity: 400,
					total: 40,
				}),
			);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 3: customize.price overrides the template base price")}`, async () => {
	const base = products.base({
		id: "preview-custom-price",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-custom-price",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: base.id,
							customize: {
								price: itemsV2.monthlyPrice({ amount: 35 }),
							},
						},
					],
				},
			],
		},
		expectedTotal: 35,
		expectedLineItemTotals: [35],
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 4: graduated prepaid tiers use the correct total")}`, async () => {
	const tiered = products.base({
		id: "preview-tiered-prepaid",
		items: [items.tieredPrepaidMessages({ includedUsage: 0 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-tiered-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [tiered] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: tiered.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 700,
								},
							],
						},
					],
				},
			],
		},
		expectedTotal: 60,
		expectedLineItemTotals: [60],
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 5: volume prepaid tiers use the correct total")}`, async () => {
	const volume = products.base({
		id: "preview-volume-prepaid",
		items: [items.volumePrepaidMessages({ includedUsage: 0 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-volume-prepaid",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [volume] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: volume.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 700,
								},
							],
						},
					],
				},
			],
		},
		expectedTotal: 35,
		expectedLineItemTotals: [35],
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 6: usage-based features stay out of the immediate total")}`, async () => {
	const usagePlan = products.pro({
		id: "preview-usage-plan",
		items: [items.consumableMessages({ includedUsage: 100, price: 0.5 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-usage-based",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [usagePlan] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: usagePlan.id }],
				},
			],
		},
		expectedTotal: 20,
		expectedLineItemTotals: [20],
		assertPreview: (preview) => {
			expect(
				preview.line_items.every((lineItem) => lineItem.feature_id === null),
			).toBe(true);
			expect(preview.next_cycle).toBeUndefined();
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 7: active upgrade preview matches the immediate replacement invoice")}`, async () => {
	const pro = products.pro({
		id: "preview-active-upgrade-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "preview-active-upgrade-premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-active-upgrade",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: premium.id }],
				},
			],
		},
		assertPreview: (preview) => {
			expect(preview.total).toBeGreaterThan(0);
			expect(preview.total).toBeLessThan(50);
			expect(preview.line_items.length).toBeGreaterThan(0);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 8: active downgrade preview matches the immediate replacement invoice")}`, async () => {
	const pro = products.pro({
		id: "preview-active-downgrade-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "preview-active-downgrade-premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-active-downgrade",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: premium.id })],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
			],
		},
		assertPreview: (preview) => {
			expect(preview.total).toBeLessThan(20);
			expect(preview.line_items.length).toBeGreaterThan(0);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 9: mixed immediate phase only charges recurring and prepaid items")}`, async () => {
	const recurring = products.pro({
		id: "preview-mixed-recurring",
		items: [items.monthlyMessages({ includedUsage: 100 })],
		group: "preview-mixed-recurring",
	});
	const prepaid = products.base({
		id: "preview-mixed-prepaid",
		items: [items.prepaidUsers()],
		group: "preview-mixed-prepaid",
	});
	const usageBased = products.base({
		id: "preview-mixed-usage",
		items: [items.consumableWords({ includedUsage: 100 })],
		group: "preview-mixed-usage",
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-mixed",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [recurring, prepaid, usageBased] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{ plan_id: recurring.id },
						{
							plan_id: prepaid.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Users,
									quantity: 4,
								},
							],
						},
						{ plan_id: usageBased.id },
					],
				},
			],
		},
		expectedTotal: 60,
		expectedLineItemTotals: [20, 40],
		assertPreview: (preview) => {
			expect(
				preview.line_items.some(
					(lineItem) => lineItem.feature_id === TestFeature.Words,
				),
			).toBe(false);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 10: customize.items uses custom prepaid and one-off prices")}`, async () => {
	const base = products.base({
		id: "preview-custom-items-chargeable",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-custom-items-chargeable",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [base] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: base.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 300,
								},
								{
									feature_id: TestFeature.Words,
									quantity: 200,
								},
							],
							customize: {
								items: [
									itemsV2.prepaidMessages({
										amount: 12,
										billingUnits: 100,
									}),
									{
										feature_id: TestFeature.Words,
										included: 0,
										price: {
											amount: 15,
											interval: BillingInterval.OneOff,
											billing_method: BillingMethod.Prepaid,
											billing_units: 100,
										},
									},
									{
										feature_id: TestFeature.Users,
										included: 0,
										price: {
											amount: 7,
											interval: BillingInterval.Month,
											billing_method: BillingMethod.UsageBased,
											billing_units: 1,
										},
									},
								],
							},
						},
					],
				},
			],
		},
		expectedTotal: 66,
		expectedLineItemTotals: [0, 30, 36],
		assertPreview: (preview) => {
			expect(
				sortStrings(
					preview.line_items.map((lineItem) => lineItem.feature_id ?? "base"),
				),
			).toEqual(
				sortStrings([
					TestFeature.Messages,
					TestFeature.Users,
					TestFeature.Words,
				]),
			);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 11: one-off plan charges now and has no next cycle")}`, async () => {
	const oneOff = products.base({
		id: "preview-one-off-base",
		items: [items.oneOffPrice({ price: 50 }), items.monthlyMessages()],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-one-off",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [oneOff] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: oneOff.id }],
				},
			],
		},
		expectedTotal: 50,
		expectedLineItemTotals: [50],
		assertPreview: (preview) => {
			expect(preview.next_cycle).toBeUndefined();
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 12: prepaid quantities only charge for units above included usage")}`, async () => {
	const prepaid = products.base({
		id: "preview-prepaid-included-usage",
		items: [items.prepaidMessages({ includedUsage: 200 })],
		group: "preview-prepaid-included-usage",
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-prepaid-included-usage",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [prepaid] }),
		],
		actions: [],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [
						{
							plan_id: prepaid.id,
							feature_quantities: [
								{
									feature_id: TestFeature.Messages,
									quantity: 200,
								},
							],
						},
					],
				},
			],
		},
		expectedTotal: 0,
		assertPreview: (preview) => {
			expect(
				preview.line_items.every((lineItem) => lineItem.total === 0),
			).toBe(true);
		},
	});
});

test.concurrent(`${chalk.yellowBright("create-schedule preview 13: active schedules can defer a future replacement without charging now")}`, async () => {
	const pro = products.pro({
		id: "preview-future-replacement-pro",
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});
	const premium = products.premium({
		id: "preview-future-replacement-premium",
		items: [items.monthlyMessages({ includedUsage: 500 })],
	});

	const { customerId, autumnV1, advancedTo } = await initScenario({
		customerId: "create-schedule-preview-future-replacement",
		setup: [
			s.customer({ paymentMethod: "success" }),
			s.products({ list: [pro, premium] }),
		],
		actions: [s.billing.attach({ productId: pro.id })],
	});

	await expectPreviewToMatchCreateSchedule({
		autumnV1,
		params: {
			customer_id: customerId,
			phases: [
				{
					starts_at: advancedTo,
					plans: [{ plan_id: pro.id }],
				},
				{
					starts_at: advancedTo + ms.days(15),
					plans: [{ plan_id: premium.id }],
				},
			],
		},
		expectedTotal: 0,
		assertPreview: (preview) => {
			expect(preview.line_items).toHaveLength(0);
			expect(preview.next_cycle).toBeDefined();
			expect(preview.next_cycle?.total).toBe(50);
			expect(preview.next_cycle?.starts_at).toBeCloseTo(
				addMonths(advancedTo, 1).getTime(),
				-ms.days(1),
			);
		},
	});
});
