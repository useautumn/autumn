/** biome-ignore-all lint/a11y/noStaticElementInteractions: needed */
/** biome-ignore-all lint/a11y/useSemanticElements: needed */
import {
	type Feature,
	FeatureType,
	type PlanLicense,
	type ProductItem,
	ProductItemFeatureType,
	type ProductV2,
	productV2ToBasePrice,
	productV2ToFrontendProduct,
	UsageModel,
} from "@autumn/shared";
import { UserFocusIcon } from "@phosphor-icons/react";
import { PlanItemLabel } from "@/components/v2/PlanItemLabel";
import { cn } from "@/lib/utils";
import { useLicenseDraft } from "./useLicenseDraftStore";
import { useLicenseRowStore, useLicenseRowSummary } from "./useLicenseRowStore";

// A license has no backing feature, so render it as a non-consumable feature
// whose "feature" is the license plan itself — included seats + per-seat base
// price — so the same display logic as normal plan item rows formats it.
function licenseToFeature(license: ProductV2): Feature {
	return {
		internal_id: license.internal_id ?? license.id,
		org_id: "",
		created_at: license.created_at,
		env: license.env,
		id: license.id,
		name: license.name ?? license.id,
		type: FeatureType.Metered,
		config: undefined,
		display: null,
		archived: false,
		event_names: [],
	};
}

function licenseToItem({
	license,
	included,
	priceProduct,
}: {
	license: ProductV2;
	included: number;
	priceProduct: ProductV2;
}): ProductItem {
	const basePrice = productV2ToBasePrice({ product: priceProduct });
	return {
		feature_id: license.id,
		feature_type: ProductItemFeatureType.ContinuousUse,
		included_usage: included,
		price: basePrice?.price ?? null,
		interval: basePrice?.interval ?? null,
		interval_count: basePrice?.interval_count ?? null,
		billing_units: 1,
		usage_model: basePrice ? UsageModel.Prepaid : null,
		tiers: null,
	};
}

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
