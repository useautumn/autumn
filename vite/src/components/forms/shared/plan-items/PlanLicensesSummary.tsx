import type {
	CustomizePlanLicense,
	Feature,
	PlanLicense,
	ProductItem,
	ProductV2,
} from "@autumn/shared";
import { formatAmount, productV2ToBasePrice } from "@autumn/shared";
import {
	ItemStatusDot,
	type ItemStatusState,
} from "@/components/v2/ItemStatusDot";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { LicenseItemLabel } from "@/components/v2/LicenseItemLabel";
import { useOrg } from "@/hooks/common/useOrg";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { cn } from "@/lib/utils";
import { layeredLicenseItems } from "@/views/products/plan/components/plan-licenses/licenseCustomizeUtils";
import { resolveLicenseProductWithFallback } from "@/views/products/plan/components/plan-licenses/resolvePlanLicenseProduct";
import { productItemsForCurrency } from "@/views/products/plan/utils/currencyUtils";
import {
	LicenseQuantityControl,
	type LicenseQuantityEditor,
} from "./LicenseQuantityControl";

type LicenseRowStatus = "unchanged" | "added" | "removed" | "changed";

type VersionedLicenseLink = PlanLicense & { version?: number };

export interface LicenseSummaryRow {
	licenseId: string;
	status: LicenseRowStatus;
	included: number;
	previousIncludedQuantity?: number;
	/** Exact license version pinned by the link; latest when absent. */
	version?: number;
}

export interface PlanLicenseRow extends LicenseSummaryRow {
	license?: ProductV2;
	/** Effective items incl. base price (stock + catalog customize + staged patch). */
	currentItems?: ProductItem[];
	/** Diff baseline: the outgoing license's items, or the saved catalog items
	 * when a patch is staged. Undefined when there is nothing to diff against. */
	previousItems?: ProductItem[];
}

export const LICENSE_DOT_STATE: Record<
	LicenseRowStatus,
	ItemStatusState | null
> = {
	added: "new",
	removed: "removed",
	changed: "updated",
	unchanged: null,
};

/**
 * Diff the plan's saved license set against staged add_licenses patch entries.
 * null/undefined addLicenses means unchanged; base licenses without a patch
 * entry keep inheriting and render as unchanged.
 */
export const diffPlanLicenses = ({
	base,
	addLicenses,
}: {
	base: VersionedLicenseLink[];
	addLicenses: CustomizePlanLicense[] | null | undefined;
}): LicenseSummaryRow[] => {
	const addsById = new Map(
		(addLicenses ?? []).map((license) => [license.license_plan_id, license]),
	);

	const baseRows = base.map((planLicense): LicenseSummaryRow => {
		const patched = addsById.get(planLicense.license_plan_id);
		if (!patched) {
			return {
				licenseId: planLicense.license_plan_id,
				status: "unchanged",
				included: planLicense.included,
				version: planLicense.version,
			};
		}

		const included = patched.included ?? planLicense.included;
		const quantityChanged = included !== planLicense.included;
		const hasChanges =
			quantityChanged ||
			Boolean(patched.customize) !== Boolean(planLicense.customize);

		return {
			licenseId: planLicense.license_plan_id,
			status: hasChanges ? "changed" : "unchanged",
			included,
			previousIncludedQuantity: quantityChanged
				? planLicense.included
				: undefined,
			version: planLicense.version,
		};
	});

	const baseIds = new Set(
		base.map((planLicense) => planLicense.license_plan_id),
	);
	const added = (addLicenses ?? [])
		.filter((license) => !baseIds.has(license.license_plan_id))
		.map(
			(license): LicenseSummaryRow => ({
				licenseId: license.license_plan_id,
				status: "added",
				included: license.included ?? 1,
			}),
		);

	return [...baseRows, ...added];
};

/** Overlays the outgoing plan's license set so rows read as a transition:
 * outgoing-only links become removed rows, included changes become updates. */
export const diffLicensesAgainstOutgoing = ({
	rows,
	outgoingLicenses,
}: {
	rows: LicenseSummaryRow[];
	outgoingLicenses: VersionedLicenseLink[];
}): LicenseSummaryRow[] => {
	const outgoingById = new Map(
		outgoingLicenses.map((license) => [license.license_plan_id, license]),
	);
	const incomingIds = new Set(rows.map((row) => row.licenseId));

	const overlaid = rows.map((row): LicenseSummaryRow => {
		const outgoing = outgoingById.get(row.licenseId);
		if (!outgoing) {
			return { ...row, status: "added", previousIncludedQuantity: undefined };
		}
		if (outgoing.included !== row.included) {
			return {
				...row,
				status: "changed",
				previousIncludedQuantity: outgoing.included,
			};
		}
		return { ...row, previousIncludedQuantity: undefined };
	});

	const removed = outgoingLicenses
		.filter((license) => !incomingIds.has(license.license_plan_id))
		.map(
			(license): LicenseSummaryRow => ({
				licenseId: license.license_plan_id,
				status: "removed",
				included: license.included,
				version: license.version,
			}),
		);

	return [...overlaid, ...removed];
};

/** Shared row model for the summary rows and the per-license item sections:
 * statuses plus each license's effective and baseline items, so both always
 * agree on what changed. */
export const usePlanLicenseRows = ({
	planId,
	addLicenses,
	outgoingLicenses,
	features,
}: {
	planId: string | undefined;
	addLicenses: CustomizePlanLicense[] | null | undefined;
	outgoingLicenses?: VersionedLicenseLink[];
	features: Feature[];
}): { rows: PlanLicenseRow[] } => {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const { planLicenses } = usePlanLicensesQuery(
		addLicenses === undefined ? undefined : planId,
	);
	const { licenseProducts } = useLicenseProductsQuery({
		enabled: addLicenses !== undefined,
		allVersions: true,
	});

	const baseRows = diffPlanLicenses({ base: planLicenses, addLicenses });
	const summaryRows = outgoingLicenses
		? diffLicensesAgainstOutgoing({ rows: baseRows, outgoingLicenses })
		: baseRows;

	const savedById = new Map(
		planLicenses.map((planLicense) => [
			planLicense.license_plan_id,
			planLicense,
		]),
	);
	const patchById = new Map(
		(addLicenses ?? []).map((patch) => [patch.license_plan_id, patch]),
	);
	const outgoingById = new Map(
		(outgoingLicenses ?? []).map((license) => [
			license.license_plan_id,
			license,
		]),
	);

	const rows = summaryRows.map((row): PlanLicenseRow => {
		const license = resolveLicenseProductWithFallback({
			products: licenseProducts,
			planId: row.licenseId,
			version: row.version,
		});
		if (!license) return row;

		const isRemoved = row.status === "removed";
		const saved = savedById.get(row.licenseId);
		const patch = patchById.get(row.licenseId);
		const outgoing = outgoingById.get(row.licenseId);

		const outgoingProduct = outgoing
			? resolveLicenseProductWithFallback({
					products: licenseProducts,
					planId: row.licenseId,
					version: outgoing.version,
				})
			: undefined;
		const outgoingItems =
			outgoing && outgoingProduct
				? layeredLicenseItems({
						license: outgoingProduct,
						catalogCustomize: outgoing.customize,
						features,
						currency: orgDefaultCurrency,
					})
				: undefined;

		const currentItems = isRemoved
			? []
			: layeredLicenseItems({
					license,
					catalogCustomize: saved?.customize,
					patchCustomize: patch?.customize,
					features,
					currency: orgDefaultCurrency,
				});

		const previousItems =
			outgoingItems ??
			(!isRemoved && patch?.customize
				? layeredLicenseItems({
						license,
						catalogCustomize: saved?.customize,
						features,
						currency: orgDefaultCurrency,
					})
				: undefined);

		return { ...row, license, currentItems, previousItems };
	});

	return { rows };
};

/** Fingerprint of a priced item; entitlement-only fields are excluded so
 * included/limit edits don't read as billing changes. */
const itemPriceKey = (item: ProductItem): string =>
	JSON.stringify({
		feature: item.feature_id ?? null,
		price: item.price ?? null,
		tiers: item.tiers ?? null,
		interval: item.interval ?? null,
		interval_count: item.interval_count ?? 1,
		billing_units: item.billing_units ?? 1,
		usage_model: item.usage_model ?? null,
	});

/** True when the row's effective items price differently than its baseline
 * (outgoing license or saved catalog state). */
export const licenseRowHasBillingChanges = (row: PlanLicenseRow): boolean => {
	if (!row.previousItems || !row.currentItems) return false;
	const pricedKeys = (items: ProductItem[]) =>
		items
			.filter((item) => item.price != null || (item.tiers?.length ?? 0) > 0)
			.map(itemPriceKey)
			.sort();
	const previous = pricedKeys(row.previousItems);
	const current = pricedKeys(row.currentItems);
	return (
		previous.length !== current.length ||
		previous.some((key, index) => key !== current[index])
	);
};

/**
 * License rows for the plan summary shown in attach / update sheets, rendered
 * in the same style as the subscription detail sheet's license row. Renders
 * nothing when the caller doesn't support license editing
 * (`addLicenses === undefined`) or the plan grants no licenses.
 */
export function PlanLicensesSummary({
	planId,
	addLicenses,
	features,
	showDiff,
	changesOnly = false,
	quantityEditor,
	currency,
	outgoingLicenses,
}: {
	planId: string | undefined;
	addLicenses: CustomizePlanLicense[] | null | undefined;
	features: Feature[];
	showDiff: boolean;
	changesOnly?: boolean;
	quantityEditor?: LicenseQuantityEditor;
	currency?: string;
	/** Outgoing plan's licenses (attach review) — turns rows into a transition diff. */
	outgoingLicenses?: VersionedLicenseLink[];
}) {
	const { org } = useOrg();
	const orgDefaultCurrency = org?.default_currency ?? "USD";
	const { rows: allRows } = usePlanLicenseRows({
		planId,
		addLicenses,
		outgoingLicenses: showDiff ? outgoingLicenses : undefined,
		features,
	});

	if (addLicenses === undefined) return null;

	const rows = changesOnly
		? allRows.filter((row) => row.status !== "unchanged")
		: allRows;

	if (rows.length === 0) return null;

	const basePriceOf = (license: ProductV2, items: ProductItem[]) =>
		productV2ToBasePrice({
			product: {
				...license,
				items: productItemsForCurrency({
					items,
					currency,
					orgDefaultCurrency,
				}),
			},
		});

	const formatPrice = (amount: number | null | undefined) =>
		amount
			? formatAmount({
					currency: currency ?? orgDefaultCurrency,
					amount,
					amountFormatOptions: { currencyDisplay: "narrowSymbol" },
				})
			: "Free";

	return (
		<div className="flex flex-col">
			{rows.map((row) => {
				const isRemoved = row.status === "removed";
				const labelItems = isRemoved ? row.previousItems : row.currentItems;
				const dotState = showDiff ? LICENSE_DOT_STATE[row.status] : null;
				const showQuantityChange =
					showDiff && row.previousIncludedQuantity !== undefined;
				const showQuantityControl = quantityEditor !== undefined && !isRemoved;

				const currentPrice =
					row.license && row.currentItems
						? basePriceOf(row.license, row.currentItems)
						: undefined;
				const previousPrice =
					row.license && row.previousItems
						? basePriceOf(row.license, row.previousItems)
						: undefined;
				const showPriceChange =
					showDiff &&
					!isRemoved &&
					row.previousItems !== undefined &&
					(previousPrice?.price ?? null) !== (currentPrice?.price ?? null);

				return (
					<div key={row.licenseId} className="flex items-center gap-2 py-1">
						<div
							className={cn(
								"flex items-center flex-1 gap-2 min-w-0 overflow-hidden",
								showDiff && isRemoved && "opacity-50 line-through",
							)}
						>
							{row.license ? (
								<LicenseItemLabel
									license={row.license}
									included={row.included}
									currency={currency}
									items={labelItems}
								/>
							) : (
								<>
									<LicenseIcon size={14} className="shrink-0" />
									<span className="truncate text-sm">{row.licenseId}</span>
								</>
							)}
						</div>
						<div className="flex items-center gap-2 shrink-0">
							{showPriceChange && (
								<span className="text-xs text-tertiary-foreground tabular-nums whitespace-nowrap">
									{formatPrice(previousPrice?.price)} →{" "}
									{formatPrice(currentPrice?.price)}
								</span>
							)}
							{showQuantityChange && (
								<span className="text-xs text-tertiary-foreground tabular-nums">
									{row.previousIncludedQuantity} → {row.included} included
								</span>
							)}
							{dotState && <ItemStatusDot state={dotState} />}
							{showQuantityControl && (
								<LicenseQuantityControl
									editor={quantityEditor}
									licensePlanId={row.licenseId}
									includedQuantity={row.included}
								/>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
}
