import {
	type FullPlanLicense,
	getProductItemDisplay,
	mapToProductV2,
} from "@autumn/shared";
import {
	licenseToFeature,
	licenseToItem,
} from "@/views/products/plan/components/plan-licenses/licenseItemDisplay";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";
import { visiblePlanItems } from "./catalogGrouping";

export const getPlanLicensePreview = ({
	license,
	currency,
	orgDefaultCurrency,
}: {
	license: FullPlanLicense;
	currency: string;
	orgDefaultCurrency: string;
}) => {
	const product = mapToProductV2({ product: license.product });
	const priceProduct = {
		...product,
		items: productItemsForCurrency({
			items: product.items,
			currency,
			orgDefaultCurrency,
		}),
	};
	const display = getProductItemDisplay({
		item: licenseToItem({
			license: product,
			included: license.included,
			priceProduct,
		}),
		features: [licenseToFeature(product)],
		currency,
		fullDisplay: true,
		amountFormatOptions: { currencyDisplay: "narrowSymbol" },
	});

	return {
		display,
		...visiblePlanItems({ items: priceProduct.items, limit: 2 }),
	};
};
