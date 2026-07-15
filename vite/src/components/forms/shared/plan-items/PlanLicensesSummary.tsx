import type { CustomizePlanLicense, PlanLicense } from "@autumn/shared";
import {
	ItemStatusDot,
	type ItemStatusState,
} from "@/components/v2/ItemStatusDot";
import { LicenseIcon } from "@/components/v2/icons/LicenseIcon";
import { useLicenseProductsQuery } from "@/hooks/queries/useLicenseProductsQuery";
import { usePlanLicensesQuery } from "@/hooks/queries/usePlanLicensesQuery";
import { cn } from "@/lib/utils";
import {
	LicenseQuantityControl,
	type LicenseQuantityEditor,
} from "./LicenseQuantityControl";

type LicenseRowStatus = "unchanged" | "added" | "removed" | "changed";

interface LicenseSummaryRow {
	licenseId: string;
	status: LicenseRowStatus;
	included: number;
	previousIncludedQuantity?: number;
}

const DOT_STATE: Record<LicenseRowStatus, ItemStatusState | null> = {
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
	base: PlanLicense[];
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

/**
 * Compact license rows for the plan summary shown in attach / update sheets,
 * with add/quantity diffing against the plan's saved license set. Renders
 * nothing when the caller doesn't support license editing
 * (`addLicenses === undefined`) or the plan grants no licenses.
 */
export function PlanLicensesSummary({
	planId,
	addLicenses,
	showDiff,
	changesOnly = false,
	quantityEditor,
}: {
	planId: string | undefined;
	addLicenses: CustomizePlanLicense[] | null | undefined;
	showDiff: boolean;
	changesOnly?: boolean;
	quantityEditor?: LicenseQuantityEditor;
}) {
	const { planLicenses } = usePlanLicensesQuery(
		addLicenses === undefined ? undefined : planId,
	);
	const { licenseProducts } = useLicenseProductsQuery({
		enabled: addLicenses !== undefined,
	});

	if (addLicenses === undefined) return null;

	const allRows = diffPlanLicenses({ base: planLicenses, addLicenses });
	const rows = changesOnly
		? allRows.filter((row) => row.status !== "unchanged")
		: allRows;

	if (rows.length === 0) return null;

	const licenseName = (licenseId: string) =>
		licenseProducts.find((license) => license.id === licenseId)?.name ??
		licenseId;

	return (
		<div className="flex flex-col">
			{rows.map((row) => {
				const dotState = showDiff ? DOT_STATE[row.status] : null;
				const showQuantityChange =
					showDiff && row.previousIncludedQuantity !== undefined;
				const includedLabel = showQuantityChange
					? `${row.previousIncludedQuantity} → ${row.included} included`
					: `${row.included} included`;
				const showQuantityControl =
					quantityEditor !== undefined && row.status !== "removed";
				return (
					<div
						key={row.licenseId}
						className="flex items-center justify-between h-9 text-sm"
					>
						<div
							className={cn(
								"flex items-center gap-2 min-w-0",
								showDiff &&
									row.status === "removed" &&
									"opacity-50 line-through",
							)}
						>
							{dotState && <ItemStatusDot state={dotState} />}
							<LicenseIcon size={14} className="shrink-0" />
							<span className="truncate">{licenseName(row.licenseId)}</span>
						</div>
						{showQuantityControl ? (
							<LicenseQuantityControl
								editor={quantityEditor}
								licensePlanId={row.licenseId}
								includedQuantity={row.included}
							/>
						) : (
							<span className="text-tertiary-foreground shrink-0">
								{includedLabel}
							</span>
						)}
					</div>
				);
			})}
		</div>
	);
}
