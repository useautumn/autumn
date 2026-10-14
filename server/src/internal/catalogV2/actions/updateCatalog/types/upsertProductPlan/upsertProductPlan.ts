import type {
	ApiRevenueCatPlanProcessor,
	CatalogPlanVersioningStrategy,
	CatalogPropagateParams,
	CatalogVariantParams,
	CustomizePlanLicense,
	FullProduct,
	PlanAliasReplacement,
	PlanLicenseParams,
	RemovePlanLicense,
} from "@autumn/shared";
import type { EntitlementPricesPlan } from "@/internal/products/actions/computeEntitlementPricesPlan";
import type { FreeTrialPlan } from "./freeTrialPlan";
import type { PlanLicensePlan } from "./planLicensePlan";
import type { ProductDetailsPlan } from "./productDetailsPlan";

export type UpsertProductOp = "create" | "update" | "none";

export type UpsertProductSource =
	| "direct"
	| "all_versions"
	| "variant_propagation"
	| "variant_link"
	| "license_pin"
	| "license_adopt"
	| "repoint"
	| "processor_sync"
	| "demoted_product";

export type UpsertProductRow = {
	planId: string;
	version: number;
	op: UpsertProductOp;
	source: UpsertProductSource;
	versioning: CatalogPlanVersioningStrategy;
	currentFullProduct: FullProduct | null;
	baseFullProduct: FullProduct | null;
	nextFullProduct: FullProduct;
};

export type UpsertProductPlan = {
	row: UpsertProductRow;

	details?: ProductDetailsPlan;
	entitlementPricesPlan?: EntitlementPricesPlan;
	freeTrialPlan?: FreeTrialPlan;
	declaredLicenses?: PlanLicenseParams[];
	upsertLicenses?: CustomizePlanLicense[];
	removeLicenses?: RemovePlanLicense[];
	declaredVariants?: CatalogVariantParams[];
	unlink?: boolean;
	propagate?: CatalogPropagateParams;
	revenuecatProcessor?: ApiRevenueCatPlanProcessor | null;
	stripeUnlinked?: boolean;
	planLicenses?: PlanLicensePlan[];
	createInStripe?: boolean;
	aliasReplacement?: PlanAliasReplacement;
	previousActiveInternalId?: string;

	state: {
		hasCustomers: boolean;
		planHadLiveVersions: boolean;
	};
};
