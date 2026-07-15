import type { AggregatedFeatureBalance } from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import type { DbCustomerEntitlement } from "../../cusProductModels/cusEntModels/cusEntTable.js";
import type { Replaceable } from "../../cusProductModels/cusEntModels/replaceableTable.js";
import type { DbRollover } from "../../cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import type { DbUsageWindow } from "../../cusProductModels/cusEntModels/usageWindowTable.js";
import type { DbCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceTable.js";
import type { DbCustomerProduct } from "../../cusProductModels/cusProductTable.js";
import type { DbFeature } from "../../featureModels/featureTable.js";
import type { DbCustomerLicense } from "../../licenseModels/customerLicenseTable.js";
import type { DbPlanLicense } from "../../licenseModels/planLicenseTable.js";
import type { MigrationItemRunData } from "../../migrationV2Models/migrationItemRunSchema.js";
import type { DbEntitlement } from "../../productModels/entModels/entTable.js";
import type { DbFreeTrial } from "../../productModels/freeTrialModels/freeTrialTable.js";
import type { DbPrice } from "../../productModels/priceModels/priceTable.js";
import type { FullProductWithoutLicenses } from "../../productModels/productModels.js";
import type { DbProduct } from "../../productModels/productTable.js";
import type { Subscription } from "../../subModels/subModels.js";
import type { DbCustomer } from "../cusTable.js";
import type { Entity } from "../entityModels/entityModels.js";
import type { Invoice } from "../invoiceModels/invoiceModels.js";

type EntitlementWithFeatureRow = DbEntitlement & {
	feature: DbFeature;
};

/** One customer license bundle: the row, its effective plan license
 * (customer override beats catalog; null when the link was removed), and
 * that license's effective product — mirrors getFullCustomerLicenses. */
export type SubjectCustomerLicenseRow = {
	customerLicense: DbCustomerLicense;
	planLicense: DbPlanLicense | null;
	product: FullProductWithoutLicenses;
};

/** Parent lifecycle fields a seat inherits, fetched status-filter-free. */
export type ParentCustomerProductLifecycle = Pick<
	DbCustomerProduct,
	"status" | "subscription_ids" | "canceled_at"
>;

/** Seat rows carry their anchoring pool row + the parent's lifecycle
 * snapshot; null on non-seat rows. */
export type CustomerProductRow = DbCustomerProduct & {
	parent_customer_license?: DbCustomerLicense | null;
	parent_customer_product?: ParentCustomerProductLifecycle | null;
};

/** Raw row shape returned by the getFullSubjectQuery SQL query. */
export type SubjectQueryRow = {
	customer: DbCustomer;
	customer_products: CustomerProductRow[];
	customer_entitlements: DbCustomerEntitlement[];
	customer_prices: DbCustomerPrice[];
	customer_licenses: SubjectCustomerLicenseRow[];
	extra_customer_entitlements: DbCustomerEntitlement[];
	replaceables: Replaceable[];
	rollovers: DbRollover[];
	usage_windows: DbUsageWindow[];
	products: DbProduct[];
	entitlements: EntitlementWithFeatureRow[];
	prices: DbPrice[];
	free_trials: DbFreeTrial[];
	entity_aggregations?: {
		aggregated_customer_products: DbCustomerProduct[];
		aggregated_customer_entitlements: AggregatedFeatureBalance[];
	};
	subscriptions: Subscription[];
	invoices?: Invoice[];
	entity?: Entity;
	migration_item_runs?: MigrationItemRunData[];
};
