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
import type { DbPooledBalance } from "../../pooledBalanceModels/pooledBalanceTable.js";
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

type SubjectCustomerEntitlementRow = DbCustomerEntitlement & {
	pooled_balance?: DbPooledBalance | null;
};

export type SubjectCustomerLicenseRow = {
	customerLicense: DbCustomerLicense;
	planLicense: DbPlanLicense | null;
	product: FullProductWithoutLicenses;
};

export type ParentCustomerProductLifecycle = Pick<
	DbCustomerProduct,
	"status" | "subscription_ids" | "canceled_at"
>;

export type CustomerProductRow = DbCustomerProduct & {
	parent_customer_license?: DbCustomerLicense | null;
	parent_customer_product?: ParentCustomerProductLifecycle | null;
};

export type SubjectQueryRow = {
	customer: DbCustomer;
	customer_products: CustomerProductRow[];
	customer_entitlements: SubjectCustomerEntitlementRow[];
	customer_prices: DbCustomerPrice[];
	customer_licenses: SubjectCustomerLicenseRow[];
	extra_customer_entitlements: SubjectCustomerEntitlementRow[];
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

export type SubjectCatalog = {
	products: DbProduct[];
	entitlements: EntitlementWithFeatureRow[];
	prices: DbPrice[];
	free_trials: DbFreeTrial[];
};

export type SubjectQueryEnvelope = SubjectCatalog & {
	subjects: Omit<SubjectQueryRow, keyof SubjectCatalog>[];
};
