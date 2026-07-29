import type {
	CustomizePlanLicense,
	Feature,
	PlanLicense,
	ProductItem,
} from "@autumn/shared";
import { productV2ToFrontendProduct } from "@autumn/shared";
import { ItemStatusDot } from "@/components/v2/ItemStatusDot";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { SheetSection } from "@/components/v2/sheets/SharedSheetComponents";
import { useOrg } from "@/hooks/common/useOrg";
import { cn } from "@/lib/utils";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";
import { PlanItemsSection } from "../PlanItemsSection";
import {
	LICENSE_DOT_STATE,
	type PlanLicenseRow,
	usePlanLicenseRows,
} from "./PlanLicensesSummary";

const EMPTY_QUANTITIES: Record<string, number | undefined> = {};

/**
 * One section per license with the license's own feature rows — the forms twin
 * of the subscription detail sheet's SubscriptionDetailLicenses. In diff mode
 * each section diffs its items against the outgoing license (attach review) or
 * the saved catalog items (staged customize in the update flow).
 */
export function PlanLicenseItemsSections({
	planId,
	addLicenses,
	features,
	currency,
	showDiff,
	outgoingLicenses,
}: {
	planId: string | undefined;
	addLicenses: CustomizePlanLicense[] | null | undefined;
	features: Feature[];
	currency: string;
	showDiff: boolean;
	outgoingLicenses?: (PlanLicense & { version?: number })[];
}) {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const { rows } = usePlanLicenseRows({
		planId,
		addLicenses,
		outgoingLicenses: showDiff ? outgoingLicenses : undefined,
		features,
	});

	if (addLicenses === undefined || rows.length === 0) return null;

	const displayFeatureItems = (items: ProductItem[] | undefined) =>
		items === undefined
			? undefined
			: productItemsForCurrency({
					items: items.filter((item) => Boolean(item.feature_id)),
					currency,
					orgDefaultCurrency,
				});

	const renderSection = (row: PlanLicenseRow) => {
		const { license } = row;
		if (!license) return null;

		const isRemoved = row.status === "removed";
		const currentItems = displayFeatureItems(row.currentItems) ?? [];
		const originalItems = showDiff
			? displayFeatureItems(row.previousItems)
			: undefined;
		if (currentItems.length === 0 && (originalItems?.length ?? 0) === 0) {
			return null;
		}

		const dotState = showDiff ? LICENSE_DOT_STATE[row.status] : null;

		return (
			<SheetSection
				key={row.licenseId}
				withSeparator
				title={
					<span
						className={cn(
							"flex items-center gap-2 min-w-0 text-sm",
							showDiff && isRemoved && "opacity-50",
						)}
					>
						<LicenseIcon size={14} className="shrink-0" />
						<span
							className={cn(
								"truncate",
								showDiff && isRemoved && "line-through",
							)}
						>
							{license.name ?? row.licenseId}
						</span>
						{dotState && <ItemStatusDot state={dotState} />}
					</span>
				}
			>
				<PlanItemsSection
					product={{
						...productV2ToFrontendProduct({ product: license }),
						items: currentItems,
					}}
					originalItems={originalItems}
					features={features}
					prepaidOptions={EMPTY_QUANTITIES}
					initialPrepaidOptions={EMPTY_QUANTITIES}
					showDiff={showDiff && originalItems !== undefined}
					currency={currency}
					onEditPlan={() => {}}
					gateDeletedItemsByDiff
					readOnly
					showPriceHeader={false}
				/>
			</SheetSection>
		);
	};

	return <>{rows.map(renderSection)}</>;
}
