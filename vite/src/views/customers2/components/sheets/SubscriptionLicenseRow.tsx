import type { FullPlanLicense } from "@autumn/shared";
import { mapToProductV2, productV2ToFrontendProduct } from "@autumn/shared";
import { UserFocusIcon } from "@phosphor-icons/react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import {
	licenseToFeature,
	licenseToItem,
} from "@/views/products/plan/components/plan-licenses/licenseItemDisplay";

/** Read-only twin of the plan editor's LicensePlanRow: the license shown as
 * an item row of the parent plan ("$20 per Dev Seat per month"). */
export function SubscriptionLicenseRow({
	planLicense,
}: {
	planLicense: FullPlanLicense;
}) {
	const { displayCurrency, productForDisplay } = useCustomerDisplayCurrency();

	const license = mapToProductV2({ product: planLicense.product });
	const priceProduct = productForDisplay(
		productV2ToFrontendProduct({ product: license }),
	);

	return (
		<div className="flex items-center w-full py-1">
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<PlanItemLabel
					currency={displayCurrency}
					feature={licenseToFeature(license)}
					featureIcon={
						<UserFocusIcon
							className="text-blue-500"
							size={16}
							weight="duotone"
						/>
					}
					item={licenseToItem({
						license,
						included: planLicense.included,
						priceProduct,
					})}
				/>
			</div>
		</div>
	);
}
