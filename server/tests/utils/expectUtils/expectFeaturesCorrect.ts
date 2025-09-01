import {
	type CreateEntity,
	type FeatureOptions,
	Infinite,
	type ProductV2,
} from "@autumn/shared";
import type { Customer, Entity } from "autumn-js";
import { expect } from "chai";
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
	customer: Customer | Entity;
	product: ProductV2;
	otherProducts?: ProductV2[];
	productQuantity?: number;
	options?: FeatureOptions[];
	usage?: {
		featureId: string;
		value: number;
	}[];
	entities?: CreateEntity[];
}) => {
	const items = product.items;

	const featureIds = Array.from(
		new Set(product.items.map((i) => i.feature_id)),
	).filter(notNullish);

	const otherItems = otherProducts?.flatMap((p) => p.items) || [];

	for (const featureId of featureIds) {
		let includedUsage: string | number = 0;

		const item = items.find((i) => i.feature_id === featureId)!;
		expect(item, `Item ${featureId} exists`).to.exist;

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

		const feature = customer.features[featureId!];

		expect(feature, `Feature ${featureId} exists`).to.exist;

		// @ts-expect-error

		// 1. Check that included usage matches
		expect(
			feature.included_usage,
			`Feature ${featureId} included usage is correct`,
		).to.equal(includedUsage);

		// 2. Check that unlimited is set correctly
		if (item?.included_usage === Infinite) {
			expect(feature.unlimited, `Feature ${featureId} is unlimited`).to.be.true;
		} else {
			expect(
				feature.unlimited === false || nullish(feature.unlimited),
				`Feature ${featureId} is not unlimited`,
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

		expect(feature.usage, `Feature ${featureId} usage is correct`).to.equal(
			featureUsage,
		);
	}
};
