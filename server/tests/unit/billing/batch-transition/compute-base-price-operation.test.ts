import { describe, expect, test } from "bun:test";
import { BillingInterval, type Price, PriceType } from "@autumn/shared";
import { computeBasePriceOperation } from "@/internal/billing/v2/actions/batchTransition/compute/operations/basePriceOperations/computeBasePriceOperation";

const fixedPrice = ({
	id,
	amount,
	entitlementId = null,
}: {
	id: string;
	amount: number;
	entitlementId?: string | null;
}): Price => ({
	id,
	internal_product_id: "seat_product",
	entitlement_id: entitlementId,
	proration_config: null,
	config: {
		type: PriceType.Fixed,
		amount,
		interval: BillingInterval.Month,
		feature_id: null,
		internal_feature_id: null,
	},
});

describe("computeBasePriceOperation", () => {
	const fromPrice = fixedPrice({ id: "price_from", amount: 10 });
	const toPrice = fixedPrice({ id: "price_to", amount: 20 });

	test("replaces every physical price matching the outgoing definition", () => {
		const duplicateDefinition = fixedPrice({
			id: "price_duplicate",
			amount: 10,
		});
		const customizedPrice = fixedPrice({ id: "price_custom", amount: 15 });

		expect(
			computeBasePriceOperation({
				basePriceTransition: { type: "replace", fromPrice, toPrice },
				candidateOutgoingBasePrices: [
					fromPrice,
					duplicateDefinition,
					customizedPrice,
				],
			}),
		).toEqual({
			type: "replace",
			fromPriceIds: [fromPrice.id, duplicateDefinition.id],
			fromPrice,
			toPrice,
		});
	});

	test("does not match an entitlement-linked price with the same definition", () => {
		const entitlementPrice = fixedPrice({
			id: "price_entitlement",
			amount: 10,
			entitlementId: "ent_messages",
		});

		expect(
			computeBasePriceOperation({
				basePriceTransition: { type: "replace", fromPrice, toPrice },
				candidateOutgoingBasePrices: [entitlementPrice],
			}),
		).toBeUndefined();
	});

	test("does not trust a matching price ID when the definition differs", () => {
		const mismatchedDefinition = fixedPrice({
			id: fromPrice.id,
			amount: 15,
		});

		expect(
			computeBasePriceOperation({
				basePriceTransition: { type: "replace", fromPrice, toPrice },
				candidateOutgoingBasePrices: [mismatchedDefinition],
			}),
		).toBeUndefined();
	});

	test("does nothing when assignments already use the incoming price", () => {
		const sameDefinitionTarget = fixedPrice({ id: "price_to", amount: 10 });

		expect(
			computeBasePriceOperation({
				basePriceTransition: {
					type: "replace",
					fromPrice,
					toPrice: sameDefinitionTarget,
				},
				candidateOutgoingBasePrices: [sameDefinitionTarget],
			}),
		).toBeUndefined();
	});

	test("removes only prices matching the outgoing definition", () => {
		const duplicateDefinition = fixedPrice({
			id: "price_duplicate",
			amount: 10,
		});
		const customizedPrice = fixedPrice({ id: "price_custom", amount: 15 });

		expect(
			computeBasePriceOperation({
				basePriceTransition: { type: "remove", fromPrice, toPrice: null },
				candidateOutgoingBasePrices: [duplicateDefinition, customizedPrice],
			}),
		).toEqual({
			type: "remove",
			fromPriceIds: [duplicateDefinition.id],
			fromPrice,
		});
	});

	test("adds only where none of the existing base definitions are present", () => {
		const customizedPrice = fixedPrice({ id: "price_custom", amount: 15 });

		expect(
			computeBasePriceOperation({
				basePriceTransition: { type: "add", fromPrice: null, toPrice },
				candidateOutgoingBasePrices: [customizedPrice, toPrice],
			}),
		).toEqual({
			type: "add",
			existingBasePriceIds: [customizedPrice.id, toPrice.id],
			toPrice,
		});
	});
});
