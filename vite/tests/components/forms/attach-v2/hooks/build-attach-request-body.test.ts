import { describe, expect, test } from "bun:test";
import {
	type ProductItem,
	ProductItemInterval,
	type ProductV2,
	UsageModel,
} from "@autumn/shared";
import { addDays } from "date-fns";
import { buildAttachRequestBody } from "@/components/forms/attach-v2/hooks/useAttachRequestBody";

function makeProduct({ items }: { items: ProductV2["items"] }): ProductV2 {
	return {
		id: "prod_test",
		name: "Test Product",
		is_add_on: false,
		is_default: false,
		version: 1,
		group: null,
		env: "sandbox" as ProductV2["env"],
		items,
		created_at: Date.now(),
	};
}

const baseParams: Omit<
	Parameters<typeof buildAttachRequestBody>[0],
	"product" | "prepaidOptions"
> = {
	customerId: "cus_123",
	entityId: undefined,
	items: null,
	grantFree: false,
	version: undefined,
	trialLength: null,
	trialDuration: "day" as const,
	trialEnabled: false,
	trialCardRequired: false,
	planSchedule: null,
	startDate: null,
	prorationBehavior: null,
	redirectMode: "if_required",
	newBillingSubscription: false,
	resetBillingCycle: false,
	discounts: [],
	noBillingChanges: false,
	carryOverBalances: false,
	carryOverBalanceFeatureIds: [],
	carryOverUsages: false,
	carryOverUsageFeatureIds: [],
	customLineItems: [],
	disableProration: false,
};

describe("buildAttachRequestBody — billing_units handling", () => {
	test("should pass display quantities through as-is, not multiply by billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: { messages: 5000 },
		});

		expect(result?.options).toEqual([
			{ feature_id: "messages", quantity: 5000 },
		]);
	});

	test("should not divide display quantities by billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: { messages: 5000 },
		});

		// Must NOT be 5 (5000 / 1000)
		expect(result?.options?.[0]?.quantity).not.toBe(5);
		// Must NOT be 5,000,000 (5000 * 1000)
		expect(result?.options?.[0]?.quantity).not.toBe(5000000);
		expect(result?.options?.[0]?.quantity).toBe(5000);
	});

	test("should handle multiple prepaid features with different billing_units", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
				{
					feature_id: "tokens",
					usage_model: UsageModel.Prepaid,
					billing_units: 500,
				},
			],
		});

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: { messages: 10000, tokens: 2500 },
		});

		expect(result?.options).toEqual([
			{ feature_id: "messages", quantity: 10000 },
			{ feature_id: "tokens", quantity: 2500 },
		]);
	});

	test("should omit options when prepaidOptions is empty", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
		});

		expect(result?.options).toBeUndefined();
	});

	test("should return null when customerId is missing", () => {
		const product = makeProduct({
			items: [
				{
					feature_id: "messages",
					usage_model: UsageModel.Prepaid,
					billing_units: 1000,
				},
			],
		});

		const result = buildAttachRequestBody({
			...baseParams,
			customerId: undefined,
			product,
			prepaidOptions: { messages: 5000 },
		});

		expect(result).toBeNull();
	});

	test("should return null when product is missing", () => {
		const result = buildAttachRequestBody({
			...baseParams,
			product: undefined,
			prepaidOptions: { messages: 5000 },
		});

		expect(result).toBeNull();
	});
});

describe("buildAttachRequestBody — starts_at handling", () => {
	const product = makeProduct({
		items: [
			{
				price: 20,
				interval: "month",
			},
		],
	});

	test("sends starts_at instead of silently falling back to plan_schedule", () => {
		const startDate = addDays(Date.now(), 1).getTime();

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			planSchedule: "end_of_cycle",
			startDate,
		});

		expect(result?.starts_at).toBe(startDate);
		expect(result?.plan_schedule).toBeUndefined();
	});

	test("keeps plan_schedule when no starts_at is selected", () => {
		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			planSchedule: "end_of_cycle",
		});

		expect(result?.plan_schedule).toBe("end_of_cycle");
		expect(result?.starts_at).toBeUndefined();
	});

	test("does not send starts_at with a trial", () => {
		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			startDate: addDays(Date.now(), 1).getTime(),
			trialEnabled: true,
			trialLength: 7,
		});

		expect(result?.starts_at).toBeUndefined();
	});
});

describe("buildAttachRequestBody — items serialization", () => {
	test("drops empty fixed-price draft rows before serialization", () => {
		const product = makeProduct({
			items: [{ price: 20, interval: ProductItemInterval.Month }],
		});
		const items = [
			{
				feature_id: "AI_CREDITS",
				price: null,
				tiers: [{ amount: 0.01, to: "inf" }],
			},
			{
				price: "" as unknown as number,
				feature_id: null,
				price_id: null,
				entitlement_id: null,
				interval: ProductItemInterval.Month,
				interval_count: 1,
				tiers: null,
				price_config: null,
			},
		] satisfies ProductItem[];

		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			items,
		});

		expect(result?.items).toEqual([
			{
				feature_id: "AI_CREDITS",
				price: null,
				tiers: [{ amount: 0.01, to: "inf" }],
				interval: null,
			},
		]);
	});
});

describe("buildAttachRequestBody — grant free", () => {
	const product = makeProduct({
		items: [{ price: 50, interval: ProductItemInterval.Month }],
	});

	test("sends explicit empty items when granting free strips all items", () => {
		// Granting free on a purely priced product leaves an empty items array.
		// It must be sent as `items: []` so the backend overrides the product's
		// default (paid) items instead of falling back to them ($50 leak).
		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			items: [],
			grantFree: true,
		});

		expect(result?.items).toEqual([]);
	});

	test("omits items for an empty array when not granting free", () => {
		const result = buildAttachRequestBody({
			...baseParams,
			product,
			prepaidOptions: {},
			items: [],
			grantFree: false,
		});

		expect(result?.items).toBeUndefined();
	});
});
