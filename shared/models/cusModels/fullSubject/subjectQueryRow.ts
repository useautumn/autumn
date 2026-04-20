import type { AggregatedFeatureBalance } from "../../cusProductModels/cusEntModels/aggregatedCusEnt.js";
import type { DbCustomerEntitlement } from "../../cusProductModels/cusEntModels/cusEntTable.js";
import type { Replaceable } from "../../cusProductModels/cusEntModels/replaceableTable.js";
import type { DbRollover } from "../../cusProductModels/cusEntModels/rolloverModels/rolloverTable.js";
import type { DbCustomerPrice } from "../../cusProductModels/cusPriceModels/cusPriceTable.js";
import type { DbCustomerProduct } from "../../cusProductModels/cusProductTable.js";
import type { DbFeature } from "../../featureModels/featureTable.js";
import type { DbEntitlement } from "../../productModels/entModels/entTable.js";
import type { DbFreeTrial } from "../../productModels/freeTrialModels/freeTrialTable.js";
import type { DbPrice } from "../../productModels/priceModels/priceTable.js";
import type { DbProduct } from "../../productModels/productTable.js";
import type { Subscription } from "../../subModels/subModels.js";
import type { DbCustomer } from "../cusTable.js";
import type { Entity } from "../entityModels/entityModels.js";
import type { Invoice } from "../invoiceModels/invoiceModels.js";

type EntitlementWithFeatureRow = DbEntitlement & {
	feature: DbFeature;
};

/** Raw row shape returned by the getFullSubjectQuery SQL query. */
export type SubjectQueryRow = {
	customer: DbCustomer;
	customer_products: DbCustomerProduct[];
	customer_entitlements: DbCustomerEntitlement[];
	customer_prices: DbCustomerPrice[];
	extra_customer_entitlements: DbCustomerEntitlement[];
	replaceables: Replaceable[];
	rollovers: DbRollover[];
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
};
