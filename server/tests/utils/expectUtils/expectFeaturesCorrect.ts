import { expect } from "bun:test";
import {
	type ApiEntityV0,
	type CreateEntityParams,
	type FeatureOptions,
	Infinite,
	type ProductV2,
} from "@autumn/shared";
import type { Customer } from "autumn-js";
import { Decimal } from "decimal.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

export const expectFeaturesCorrect = ({
	customer,
	product,
	otherProducts,
	productQuantity,
	options,
	usage,
	entities,
}: {
	customer: Customer | ApiEntityV0;
	product: ProductV2;
	otherProducts?: ProductV2[];
	productQuantity?: number;
	options?: FeatureOptions[];
	usage?: {
		featureId: string;
		value: number;
	}[];
	entities?: CreateEntityParams[];
}) => {
	const items = product.items;

	const featureIds = Array.from(
		new Set(product.items.map((i) => i.feature_id)),
	).filter(notNullish);

	const otherItems = otherProducts?.flatMap((p) => p.items) || [];

	// console.log(`Product:`, product);
	// console.log("Customer features:", customer.features);
	for (const featureId of featureIds) {
		let includedUsage: string | number = 0;

		const item = items.find((i) => i.feature_id === featureId)!;
		expect(item, `Item ${featureId} exists`).toBeDefined();

		if (item.included_usage === undefined) continue;

		for (const item of [...items, ...otherItems]) {
			if (item.feature_id !== featureId) continue;
			if (item.included_usage === Infinite) {
				includedUsage = Infinite;
				break;
			}

			const numEntities =
				entities?.filter((e) => e.feature_id === item.entity_feature_id)
					.length || 1;

			includedUsage +=
				(item.included_usage || 0) * numEntities * (productQuantity || 1);
		}

		for (const option of options || []) {
			if (option.feature_id !== featureId) continue;
			if (option.feature_id) {
				(includedUsage as number) += option.quantity;
			}
		}

		const feature = customer.features?.[featureId!];

		expect(feature, `Feature ${featureId} exists`).toBeDefined();

		// 1. Check that included usage matches

		expect(feature?.included_usage).toBe(includedUsage as number);

		// 2. Check that unlimited is set correctly
		if (item?.included_usage === Infinite) {
			expect(feature?.unlimited).toBe(true);
		} else {
			expect(feature?.unlimited === false || nullish(feature?.unlimited)).toBe(
				true,
			);
		}

		// 3. Check that usage is correct...
		const featureUsage =
			usage?.reduce((acc, curr) => {
				if (curr.featureId === featureId) {
					acc += curr.value;
				}
				return acc;
			}, 0) || 0;

		expect(new Decimal(feature?.usage ?? 0).toDP(8).toNumber()).toBe(
			new Decimal(featureUsage).toDP(8).toNumber(),
		);
	}
};
