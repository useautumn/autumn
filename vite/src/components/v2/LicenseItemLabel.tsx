import type { ProductItem, ProductV2 } from "@autumn/shared";
import {
	productV2ToBasePrice,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { UserFocusIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useOrg } from "@/hooks/common/useOrg";
import {
	licenseToFeature,
	licenseToItem,
} from "@/views/products/plan/components/plan-licenses/licenseItemDisplay";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";

export function LicenseItemLabel({
	license,
	included,
	currency,
	items,
	wrapIcons,
}: {
	license: ProductV2;
	included: number;
	currency?: string;
	items?: ProductItem[];
	wrapIcons?: (icons: ReactNode, basePrice: ProductItem | null) => ReactNode;
}) {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";

	const frontendProduct = productV2ToFrontendProduct({ product: license });
	const priceProduct = {
		...frontendProduct,
		items: productItemsForCurrency({
			items: items ?? frontendProduct.items,
			currency,
			orgDefaultCurrency,
		}),
	};
	const basePrice = productV2ToBasePrice({ product: priceProduct });

	return (
		<PlanItemLabel
			currency={currency}
			wrapIcons={
				wrapIcons ? (icons) => wrapIcons(icons, basePrice) : undefined
			}
			feature={licenseToFeature(license)}
			featureIcon={
				<UserFocusIcon className="text-blue-500" size={16} weight="duotone" />
			}
			item={licenseToItem({ license, included, priceProduct })}
		/>
	);
}
