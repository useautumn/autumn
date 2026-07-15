import { productV2ToFrontendProduct } from "@autumn/shared";
import { Button, CopyButton, InfoRow } from "@autumn/ui";
import {
	CalendarBlankIcon,
	ChartBarIcon,
	HashIcon,
} from "@phosphor-icons/react";
import { format } from "date-fns";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { SheetHeader, SheetSection } from "@/components/v2/sheets/InlineSheet";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { useSheetStore } from "@/hooks/stores/useSheetStore";
import { useCustomerLicenseBalances } from "../customer-licenses/useCustomerLicenseBalances";
import { SubscriptionDetailItems } from "./SubscriptionDetailItems";

const ID_CHIP_INNER_CLASS = "max-w-40 text-tiny-id truncate !font-normal";

/** Detail preview for a license assignment row — the license's items plus its
 * pool inventory and assignment info, mirroring the subscription detail sheet. */
export function LicenseDetailSheet() {
	const itemId = useSheetStore((s) => s.itemId);
	const closeSheet = useSheetStore((s) => s.closeSheet);
	const { pools, isLoading, cancelLicenseAssignment, isUnassigning } =
		useCustomerLicenseBalances();
	const { licenseProducts } = useLicenseProductsQuery();

	const pool = pools.find((candidate) =>
		candidate.assignments.some(
			(assignment) => assignment.assignment_id === itemId,
		),
	);
	const assignment = pool?.assignments.find(
		(candidate) => candidate.assignment_id === itemId,
	);
	const license = licenseProducts.find(
		(candidate) => candidate.id === pool?.license_plan_id,
	);

	if (!(pool && assignment)) {
		return (
			<div className="flex flex-col h-full">
				<SheetHeader
					title="License Details"
					description={
						isLoading
							? "Loading license information..."
							: "This license assignment no longer exists."
					}
				/>
			</div>
		);
	}

	const total = pool.inventory.included;

	const handleUnassign = async () => {
		const success = await cancelLicenseAssignment({
			entityId: assignment.entity_id,
			licensePlanId: pool.license_plan_id,
		});
		if (success) closeSheet();
	};

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<SheetHeader
				title={
					<span className="flex items-center gap-2">
						<LicenseIcon size={16} />
						{pool.license_plan_name}
					</span>
				}
				description={`License details for ${pool.license_plan_name}`}
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
						value={`${pool.inventory.available} of ${total} available`}
					/>
					<InfoRow
						icon={<CalendarBlankIcon size={16} weight="duotone" />}
						label="Assigned"
						value={format(
							new Date(assignment.started_at),
							"MMM d, yyyy, HH:mm",
						)}
					/>
				</div>
			</SheetSection>

			<div className="sticky bottom-0 p-4 flex gap-2 bg-card mt-auto">
				<Button
					variant="secondary"
					className="flex-1"
					isLoading={isUnassigning}
					onClick={handleUnassign}
				>
					Unassign License
				</Button>
			</div>
		</div>
	);
}
