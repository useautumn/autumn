import type { FrontendProduct } from "@autumn/shared";
import { isPriceItem } from "@autumn/shared";
import { getPlanItemsDiff } from "@/components/forms/shared";
import { getProductPriceDisplay } from "@/components/forms/update-subscription-v2/components/PriceDisplay";

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
	currency,
}: {
	baseProduct: FrontendProduct | null | undefined;
	product: FrontendProduct;
	currency: string;
}) {
	if (!baseProduct) return false;
	return (
		!!getPlanPriceChange({ baseProduct, product, currency }) ||
		getPlanItemsDiff({
			product,
			originalItems: baseProduct.items,
			showDiff: true,
		}).hasDiffItems
	);
}
