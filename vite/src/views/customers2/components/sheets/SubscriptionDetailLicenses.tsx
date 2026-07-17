import {
	type FullCusProduct,
	mapToProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { ReadOnlyPlanItems } from "./ReadOnlyPlanItems";

/** A nulled planLicense means the catalog link was removed; nothing to show. */
export const cusProductLicenses = (cusProduct: FullCusProduct) =>
	(cusProduct.customer_licenses ?? []).flatMap((customerLicense) =>
		customerLicense.planLicense
			? [{ customerLicense, planLicense: customerLicense.planLicense }]
			: [],
	);

/** One section per license with the license's own feature rows — the sheet
 * twin of the plan page's license card. The license's price and included count
 * render as an item row in the parent plan's section (SubscriptionLicenseRow). */
export function SubscriptionDetailLicenses({
	cusProduct,
}: {
	cusProduct: FullCusProduct;
}) {
	const { displayCurrency, itemsForDisplay } = useCustomerDisplayCurrency();

	const licenses = cusProductLicenses(cusProduct);
	if (licenses.length === 0) return null;

	return (
		<>
			{licenses.map(({ customerLicense, planLicense }) => {
				const product = productV2ToFrontendProduct({
					product: mapToProductV2({ product: planLicense.product }),
				});
				const displayItems = itemsForDisplay(product.items);
				if (!displayItems.some((item) => item.feature_id)) return null;

				return (
					<SheetSection
						key={customerLicense.id}
						title={
							<span className="flex items-center gap-2 min-w-0 text-sm">
								<LicenseIcon size={14} className="shrink-0" />
								<span className="truncate">
									{product.name ?? planLicense.product.id}
								</span>
							</span>
						}
					>
						<ReadOnlyPlanItems
							items={displayItems}
							product={{ ...product, items: displayItems }}
							currency={displayCurrency}
							showBasePrice={false}
						/>
					</SheetSection>
				);
			})}
		</>
	);
}
