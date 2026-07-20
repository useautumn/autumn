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

/** A license rendered as a plan-item label ("$10 per Dev Seat per month") —
 * shared by the subscription detail sheet and the attach/update forms. */
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
	/** Effective items (e.g. with a customize applied); stock items otherwise. */
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
