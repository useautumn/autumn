import {
	type FullEntitlement,
	getFeatureInvoiceDescription,
	type Organization,
	type Price,
	type Product,
	shouldProrate,
	type UsagePriceConfig,
	usageToFeatureName,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { constructPreviewItem } from "@/internal/invoices/previewItemUtils/constructPreviewItem.js";

export const getUsageDiffLineItem = ({
	prevBalance,
	newBalance,
	org,
	price,
	newUsageAmount,
	ent,
	product,
}: {
	prevBalance: number;
	newBalance: number;
	org: Organization;
	price: Price;
	newUsageAmount: number;
	ent: FullEntitlement;
	product: Product;
}) => {
	const usageDiff = new Decimal(prevBalance).sub(newBalance).abs().toNumber();
	const isIncrease = newBalance <= prevBalance;
	const willProrate = isIncrease
		? shouldProrate(price.proration_config?.on_increase)
		: shouldProrate(price.proration_config?.on_decrease);

	let description = getFeatureInvoiceDescription({
		feature: ent.feature,
		usage: usageDiff,
		billingUnits: (price.config as UsagePriceConfig).billing_units,
	});

	if (isIncrease) {
		description = `${product.name} - Additional ${description}`;
	} else {
		description = `Unused ${product.name} - ${description}`;
	}

	let previewLineItem = constructPreviewItem({
		price,
		org,
		amount: newUsageAmount,
		description,
	});

	if (!isIncrease && !willProrate) {
		const featureName = usageToFeatureName({
			usage: usageDiff,
			feature: ent.feature,
		});

		previewLineItem = constructPreviewItem({
			priceStr: `${usageDiff} free ${featureName}`,
			price,
			org,
			// description: `${product.name} - ${usageDiff} free ${featureName}`,
			description: `${product.name} - ${featureName}`,
		});
	}

	return previewLineItem;
};
