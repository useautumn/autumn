/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import {
	type PlanLicense,
	type ProductV2,
	productV2ToFrontendProduct,
} from "@autumn/shared";
import { UserFocusIcon } from "@phosphor-icons/react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { cn } from "@/lib/utils";
import { licenseToFeature, licenseToItem } from "./licenseItemDisplay";
import { useLicenseDraft } from "./useLicenseDraftStore";
import { useLicenseRowStore, useLicenseRowSummary } from "./useLicenseRowStore";

/**
 * A linked license shown as a row in the parent plan's feature list, styled like
 * a non-consumable feature ("5 team seats" / "$10 per team seat per month"). The
 * price mirrors the license card's live edit via useLicenseRowStore; clicking
 * the row opens that license's price sheet.
 */
export function LicensePlanRow({
	planLicense,
	license,
}: {
	planLicense: PlanLicense;
	license: ProductV2;
}) {
	const draft = useLicenseDraft(license.id);
	const summary = useLicenseRowSummary(license.id);
	const requestOpen = useLicenseRowStore((s) => s.requestOpen);

	if (draft?.removed) return null;

	const included = draft?.included ?? planLicense.included;
	const priceProduct =
		summary?.product ?? productV2ToFrontendProduct({ product: license });
	const item = licenseToItem({ license, included, priceProduct });
	const feature = licenseToFeature(license);

	const open = () => requestOpen(license.id);

	return (
		<div
			className={cn(
				"flex items-center w-full select-none rounded-xl h-10! input-base input-state-open-tiny cursor-pointer hover:relative hover:z-95",
				summary?.isEditingPrice &&
					"border-transparent z-95 relative bg-interative-secondary outline-4! outline-outer-background!",
			)}
			onClick={open}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					open();
				}
			}}
			role="button"
			tabIndex={0}
		>
			<div className="flex flex-row items-center flex-1 gap-2 min-w-0 overflow-hidden">
				<PlanItemLabel
					feature={feature}
					featureIcon={
						<UserFocusIcon
							className="text-blue-500"
							size={16}
							weight="duotone"
						/>
					}
					item={item}
				/>
			</div>
		</div>
	);
}
