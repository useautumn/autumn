import { productV2ToFrontendProduct } from "@autumn/shared";
import { CopyButton, InfoRow } from "@autumn/ui";
import { ChartBarIcon, HashIcon } from "@phosphor-icons/react";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerContext } from "../../customer/CustomerContext";
import { resolveCustomerLicenseProduct } from "../customer-licenses/resolveCustomerLicenseProduct";
import { useCustomerLicenseBalances } from "../customer-licenses/useCustomerLicenseBalances";
import { LicenseAssignedEntities } from "./LicenseAssignedEntities";
import { SubscriptionDetailItems } from "./SubscriptionDetailItems";

const ID_CHIP_INNER_CLASS = "max-w-40 text-tiny-id truncate !font-normal";

/** Detail sheet for a customer-level license pool (itemId = license plan id):
 * the license's items, pool inventory, and every entity holding a seat. */
export function LicensePoolDetailSheet() {
	const licensePlanId = useSheetStore((s) => s.itemId);
	const { customer } = useCustomerContext();
	const { pools, isLoading } = useCustomerLicenseBalances({ enabled: true });
	const { licenseProducts } = useLicenseProductsQuery();

	const pool = pools.find(
		(candidate) => candidate.license_plan_id === licensePlanId,
	);
	const catalogProduct = licenseProducts.find(
		(candidate) => candidate.id === licensePlanId,
	);
	const license = pool
		? resolveCustomerLicenseProduct({
				customer,
				licensePlanId: pool.license_plan_id,
				parentPlanId: pool.parent_plan_id,
				catalogProduct,
			})
		: null;

	if (!pool) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="License Details"
					description={
						isLoading
							? "Loading license information..."
							: "This license no longer exists."
					}
				/>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<span className="flex items-center gap-2">
						<LicenseIcon size={16} />
						{pool.license_plan_name}
					</span>
				}
				description={`Entities assigned ${pool.license_plan_name}`}
			/>

			{license && license.items.length > 0 && (
				<SubscriptionDetailItems
					items={license.items}
					product={productV2ToFrontendProduct({ product: license })}
				/>
			)}

			<SheetSection withSeparator={true}>
				<div className="space-y-3">
					<InfoRow
						icon={<HashIcon size={16} />}
						label="ID"
						value={
							<CopyButton
								text={pool.license_plan_id}
								size="mini"
								className="text-tertiary-foreground"
								innerClassName={ID_CHIP_INNER_CLASS}
							/>
						}
					/>
					<InfoRow
						icon={<ChartBarIcon size={16} weight="duotone" />}
						label="Availability"
						value={`${pool.remaining} of ${pool.granted} available`}
					/>
				</div>
			</SheetSection>

			<LicenseAssignedEntities licensePlanId={pool.license_plan_id} />
		</div>
	);
}
