import { constructProduct } from "@/utils/scriptUtils/createTestProducts.js";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem.js";
import {
	APIVersion,
	FreeTrialDuration,
	ProductItemInterval,
} from "@autumn/shared";
import { TestFeature } from "tests/setup/v2Features.js";
import { AutumnInt } from "@/external/autumn/autumnCli.js";

export let defaultTrialPro = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 1500,
			interval: ProductItemInterval.Month,
		}),
	],
	isDefault: true,
	forcePaidDefault: true,
	id: "defaultTrial_pro",
	group: "defaultTrial",
	type: "pro",
	freeTrial: {
		length: 7,
		duration: FreeTrialDuration.Day,
		unique_fingerprint: false,
		card_required: false,
	},
});

export let defaultTrialFree = constructProduct({
	items: [
		constructFeatureItem({
			featureId: TestFeature.Words,
			includedUsage: 500,
			interval: ProductItemInterval.Month,
		}),
	],
	id: "defaultTrial_free",
	group: "defaultTrial",
	type: "free",
	isDefault: true,
});

export const setupDefaultTrialBefore = async ({}: {}) => {
	const autumn = new AutumnInt({ version: APIVersion.v1_2 });
	for (const product of [defaultTrialPro, defaultTrialFree]) {
		let res = await autumn.products.get(product.id);

		if (res.code === "product_not_found") {
			try {
				await autumn.products.create(product);
			} catch (error) {}
		}
	}
};
