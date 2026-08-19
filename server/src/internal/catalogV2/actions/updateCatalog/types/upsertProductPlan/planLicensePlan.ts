import type {
	FullPlanLicense,
	FullProduct,
	LicenseCustomize,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";

export type PlanLicensePricesAndEntitlements = {
	entitlementIds: string[];
	priceIds: string[];
};

export type PlanLicenseOp = "create" | "update" | "remove" | "none";

/** Link row values to persist; id is pre-minted when a fresh row is needed. */
export type PlanLicenseRowWrite = {
	id: string;
	parentInternalProductId: string;
	licenseInternalProductId: string;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
	customized: boolean;
};

/**
 * Pre-decided write program for one link — execute replays these fields
 * verbatim, in order: retire → row → junction → delete.
 */
export type PlanLicenseRowPlan = {
	/** Customer-referenced definitions are immutable: retire this row before writing. */
	retirePlanLicenseId?: string;
	row?: PlanLicenseRowWrite;
	/** Final price/entitlement ids for a link. Absent = items untouched. */
	junction?: { planLicenseId: string } & PlanLicensePricesAndEntitlements;
	/** Link row to hard-delete (remove with no customer references). */
	deletePlanLicenseId?: string;
};

/**
 * One planned plan_license write for this parent row: resolved link config,
 * the customize overlay as a custom-mode EntitlementPricesPlan, and the
 * write program execute replays.
 */
export type PlanLicensePlan = {
	op: PlanLicenseOp;
	licensePlanId: string;
	/** Latest child FullProduct (projected if in-batch). Null if unresolved or removed. */
	licenseProduct: FullProduct | null;
	/** Link content customers receive: overlay-projected, kept customization, or stock child. */
	effectiveLicenseProduct: FullProduct | null;
	currentPlanLicense: FullPlanLicense | null;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
	/** Declared customize: object = replace, null = clear, undefined = preserve. */
	customize?: LicenseCustomize | null;
	/** Overlay vs the child's rows: `same` keeps stock ids, `new` is the is_custom inserts. */
	entitlementPricesPlan?: EntitlementPricesPlan;
	/** Absent = nothing to persist for this link. */
	rowPlan?: PlanLicenseRowPlan;
};
