/**
 * Unit tests for filterCustomerProductsByProcessorType.
 *
 * Critical invariant: an unset `processor` field on a cus product MUST be
 * treated as Stripe. Legacy Stripe-managed cus products do not tag the
 * processor field; only RevenueCat-managed products explicitly set it.
 */

import { describe, expect, test } from "bun:test";
import {
	filterCustomerProductsByProcessorType,
	type FullCusProduct,
	ProcessorType,
} from "@autumn/shared";
import chalk from "chalk";

const baseCusProduct = (id: string): FullCusProduct =>
	({
		id,
		product: { name: id } as FullCusProduct["product"],
	}) as FullCusProduct;

describe(
	chalk.yellowBright("filterCustomerProductsByProcessorType"),
	() => {
		test("includes cus product with unset processor when filtering for Stripe", () => {
			const cp = baseCusProduct("legacy_stripe");
			// processor is undefined — legacy data shape
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.Stripe,
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("legacy_stripe");
		});

		test("includes cus product with null processor when filtering for Stripe", () => {
			const cp = {
				...baseCusProduct("null_stripe"),
				processor: null,
			} as unknown as FullCusProduct;
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.Stripe,
			});
			expect(result).toHaveLength(1);
		});

		test("includes cus product with explicit Stripe processor when filtering for Stripe", () => {
			const cp = {
				...baseCusProduct("explicit_stripe"),
				processor: { type: ProcessorType.Stripe },
			} as FullCusProduct;
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.Stripe,
			});
			expect(result).toHaveLength(1);
		});

		test("excludes cus product with unset processor when filtering for RevenueCat", () => {
			const cp = baseCusProduct("legacy_stripe_excluded");
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.RevenueCat,
			});
			expect(result).toHaveLength(0);
		});

		test("includes cus product with explicit RevenueCat processor when filtering for RevenueCat", () => {
			const cp = {
				...baseCusProduct("rc"),
				processor: { type: ProcessorType.RevenueCat },
			} as FullCusProduct;
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.RevenueCat,
			});
			expect(result).toHaveLength(1);
		});

		test("excludes RevenueCat cus product when filtering for Stripe", () => {
			const cp = {
				...baseCusProduct("rc"),
				processor: { type: ProcessorType.RevenueCat },
			} as FullCusProduct;
			const result = filterCustomerProductsByProcessorType({
				customerProducts: [cp],
				processorType: ProcessorType.Stripe,
			});
			expect(result).toHaveLength(0);
		});

		test("mixed list: filtering for Stripe keeps unset + explicit Stripe, drops RevenueCat", () => {
			const legacyStripe = baseCusProduct("legacy_stripe");
			const explicitStripe = {
				...baseCusProduct("explicit_stripe"),
				processor: { type: ProcessorType.Stripe },
			} as FullCusProduct;
			const rc = {
				...baseCusProduct("rc"),
				processor: { type: ProcessorType.RevenueCat },
			} as FullCusProduct;

			const result = filterCustomerProductsByProcessorType({
				customerProducts: [legacyStripe, explicitStripe, rc],
				processorType: ProcessorType.Stripe,
			});
			expect(result.map((cp) => cp.id).sort()).toEqual(
				["explicit_stripe", "legacy_stripe"].sort(),
			);
		});

		test("mixed list: filtering for RevenueCat keeps only explicit RC", () => {
			const legacyStripe = baseCusProduct("legacy_stripe");
			const rc = {
				...baseCusProduct("rc"),
				processor: { type: ProcessorType.RevenueCat },
			} as FullCusProduct;

			const result = filterCustomerProductsByProcessorType({
				customerProducts: [legacyStripe, rc],
				processorType: ProcessorType.RevenueCat,
			});
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe("rc");
		});

		test("empty list returns empty list", () => {
			expect(
				filterCustomerProductsByProcessorType({
					customerProducts: [],
					processorType: ProcessorType.Stripe,
				}),
			).toEqual([]);
		});
	},
);
