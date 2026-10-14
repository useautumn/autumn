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

export type PlanLicenseRowWrite = {
	id: string;
	parentInternalProductId: string;
	licenseInternalProductId: string;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
	customized: boolean;
};

export type PlanLicenseRowPlan = {
	retirePlanLicenseId?: string;
	row?: PlanLicenseRowWrite;
	junction?: { planLicenseId: string } & PlanLicensePricesAndEntitlements;
	deletePlanLicenseId?: string;
};

export type PlanLicensePlan = {
	op: PlanLicenseOp;
	licensePlanId: string;
	licenseProduct: FullProduct | null;
	effectiveLicenseProduct: FullProduct | null;
	currentPlanLicense: FullPlanLicense | null;
	included: number;
	prepaidOnly: boolean;
	metadata?: Record<string, unknown>;
	customize?: LicenseCustomize | null;
	declaredVersionSlug?: string;
	entitlementPricesPlan?: EntitlementPricesPlan;
	rowPlan?: PlanLicenseRowPlan;
};
