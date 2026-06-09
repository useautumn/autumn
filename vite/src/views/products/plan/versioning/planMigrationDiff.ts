import type { Feature, FrontendProduct } from "@autumn/shared";
import { diffPlanV1, isPriceItem } from "@autumn/shared";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";
import {
	frontendProductToApiPlanV1,
	getMigratablePlanDiff,
} from "./buildMigrationDraft";

export function getPlanPriceChange({
	baseProduct,
	product,
	currency,
}: {
	baseProduct: FrontendProduct | null | undefined;
	product: FrontendProduct;
	currency: string;
}) {
	if (!baseProduct) return null;

	const oldDisplay = getProductPriceDisplay({ product: baseProduct, currency });
	const newDisplay = getProductPriceDisplay({ product, currency });
	const oldPrice =
		oldDisplay.type === "price" ? oldDisplay.formattedPrice : "Free";
	const newPrice =
		newDisplay.type === "price" ? newDisplay.formattedPrice : "Free";
	const oldInterval =
		oldDisplay.type === "price" ? oldDisplay.intervalText : null;
	const newInterval =
		newDisplay.type === "price" ? newDisplay.intervalText : null;

	if (oldPrice === newPrice && oldInterval === newInterval) return null;

	const originalPriceItem = baseProduct.items?.find((i) => isPriceItem(i));
	const currentPriceItem = product.items?.find((i) => isPriceItem(i));

	return {
		oldPrice,
		newPrice,
		oldIntervalText: oldInterval !== newInterval ? oldInterval : null,
		newIntervalText: newInterval,
		isUpgrade: (currentPriceItem?.price ?? 0) > (originalPriceItem?.price ?? 0),
	};
}

export function hasPlanMigrationDiff({
	baseProduct,
	product,
	features,
}: {
	baseProduct: FrontendProduct | null | undefined;
	product: FrontendProduct;
	features: Feature[];
}) {
	if (!baseProduct) return false;

	const diff = diffPlanV1({
		from: frontendProductToApiPlanV1(baseProduct, features),
		to: frontendProductToApiPlanV1(product, features),
	});

	return Object.keys(getMigratablePlanDiff(diff)).length > 0;
}
