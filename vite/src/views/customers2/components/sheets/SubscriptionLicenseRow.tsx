import type { FullPlanLicense } from "@autumn/shared";
import { mapToProductV2 } from "@autumn/shared";
import { AdminHover } from "@/components/general/AdminHover";
import { LicenseItemLabel } from "@/components/v2/LicenseItemLabel";
import { useCustomerDisplayCurrency } from "@/hooks/common/useCustomerDisplayCurrency";
import { getProductItemHoverTexts } from "@/views/admin/adminUtils";

/** Read-only twin of the plan editor's LicensePlanRow: the license shown as
 * an item row of the parent plan ("$20 per Dev Seat per month"). */
export function SubscriptionLicenseRow({
	planLicense,
}: {
	planLicense: FullPlanLicense;
}) {
	const { displayCurrency } = useCustomerDisplayCurrency();
	const license = mapToProductV2({ product: planLicense.product });

	return (
		<div className="flex items-center w-full py-1">
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<LicenseItemLabel
					license={license}
					included={planLicense.included}
					currency={displayCurrency}
					wrapIcons={(icons, basePrice) => (
						<AdminHover texts={getProductItemHoverTexts({ item: basePrice })}>
							{icons}
						</AdminHover>
					)}
				/>
			</div>
		</div>
	);
}
