import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";
import { buildStripeQuantityUpdateAction } from "@/internal/billing/v2/subscriptionUpdate/compute/buildStripeQuantityUpdateAction";
import type { QuantityUpdateDetails } from "@/internal/billing/v2/typesOld";

const createMockQuantityUpdateDetails = (
	overrides: Partial<QuantityUpdateDetails> = {},
): QuantityUpdateDetails => ({
	featureId: "messages",
	internalFeatureId: "int_msg_123",
	previousFeatureQuantity: 5,
	updatedFeatureQuantity: 8,
	quantityDifferenceForEntitlements: 3,
	stripeSubscriptionItemQuantityDifference: 3,
	shouldApplyProration: true,
	shouldFinalizeInvoiceImmediately: true,
	billingUnitsPerQuantity: 1,
	calculatedProrationAmountDollars: 10,
	subscriptionPeriodStartEpochMs: Date.now() - 86400000,
	subscriptionPeriodEndEpochMs: Date.now() + 86400000 * 29,
	stripeInvoiceItemDescription: "Messages upgrade",
	customerPrice: {} as QuantityUpdateDetails["customerPrice"],
	stripePriceId: "price_123",
	existingStripeSubscriptionItem: undefined,
	customerEntitlementId: "ent_123",
	customerEntitlementBalanceChange: 3,
	...overrides,
});

const createMockStripeSubscriptionItem = (
	overrides: Partial<Stripe.SubscriptionItem> = {},
): Stripe.SubscriptionItem =>
	({
		id: "si_123",
		object: "subscription_item",
		quantity: 5,
		...overrides,
	}) as Stripe.SubscriptionItem;

describe("buildStripeQuantityUpdateAction", () => {
	test("should create new subscription item when no existing item", () => {
		const details = createMockQuantityUpdateDetails({
			existingStripeSubscriptionItem: undefined,
			updatedFeatureQuantity: 8,
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.type).toBe("update");
		expect(result.items).toHaveLength(1);
		expect(result.items![0].id).toBeUndefined();
		expect(result.items![0].price).toBe("price_123");
		expect(result.items![0].quantity).toBe(8);
	});

	test("should apply quantity difference when updating existing subscription item", () => {
		const existingItem = createMockStripeSubscriptionItem({
			id: "si_existing",
			quantity: 10,
		});

		const details = createMockQuantityUpdateDetails({
			existingStripeSubscriptionItem: existingItem,
			previousFeatureQuantity: 5,
			updatedFeatureQuantity: 8,
			stripeSubscriptionItemQuantityDifference: 3,
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.type).toBe("update");
		expect(result.items).toHaveLength(1);
		expect(result.items![0].id).toBe("si_existing");
		expect(result.items![0].quantity).toBe(13);
	});

	test("should handle downgrade with quantity difference", () => {
		const existingItem = createMockStripeSubscriptionItem({
			id: "si_existing",
			quantity: 15,
		});

		const details = createMockQuantityUpdateDetails({
			existingStripeSubscriptionItem: existingItem,
			previousFeatureQuantity: 10,
			updatedFeatureQuantity: 6,
			stripeSubscriptionItemQuantityDifference: -4,
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.items![0].quantity).toBe(11);
	});

	test("should handle multiple quantity updates in single action", () => {
		const existingItem1 = createMockStripeSubscriptionItem({
			id: "si_1",
			quantity: 10,
		});

		const existingItem2 = createMockStripeSubscriptionItem({
			id: "si_2",
			quantity: 20,
		});

		const details1 = createMockQuantityUpdateDetails({
			featureId: "messages",
			existingStripeSubscriptionItem: existingItem1,
			previousFeatureQuantity: 5,
			updatedFeatureQuantity: 8,
			stripeSubscriptionItemQuantityDifference: 3,
			stripePriceId: "price_1",
		});

		const details2 = createMockQuantityUpdateDetails({
			featureId: "words",
			existingStripeSubscriptionItem: existingItem2,
			previousFeatureQuantity: 15,
			updatedFeatureQuantity: 10,
			stripeSubscriptionItemQuantityDifference: -5,
			stripePriceId: "price_2",
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details1, details2],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.items).toHaveLength(2);
		expect(result.items![0].quantity).toBe(13);
		expect(result.items![1].quantity).toBe(15);
	});

	test("should handle zero difference correctly", () => {
		const existingItem = createMockStripeSubscriptionItem({
			id: "si_existing",
			quantity: 10,
		});

		const details = createMockQuantityUpdateDetails({
			existingStripeSubscriptionItem: existingItem,
			previousFeatureQuantity: 5,
			updatedFeatureQuantity: 5,
			stripeSubscriptionItemQuantityDifference: 0,
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.items![0].quantity).toBe(10);
	});

	test("should handle existing item with undefined quantity", () => {
		const existingItem = createMockStripeSubscriptionItem({
			id: "si_existing",
			quantity: undefined,
		});

		const details = createMockQuantityUpdateDetails({
			existingStripeSubscriptionItem: existingItem,
			previousFeatureQuantity: 0,
			updatedFeatureQuantity: 5,
			stripeSubscriptionItemQuantityDifference: 5,
		});

		const result = buildStripeQuantityUpdateAction({
			quantityUpdateDetails: [details],
			stripeSubscriptionId: "sub_123",
		});

		expect(result.items![0].quantity).toBe(5);
	});
});
