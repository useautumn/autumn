import type { Customer } from "../../cusModels/cusModels.js";
import type { Entity } from "../../cusModels/entityModels/entityModels.js";
import type { FullSubject } from "../../cusModels/fullSubject/fullSubjectModel.js";
import type { EntitlementWithFeature } from "../../productModels/entModels/entModels.js";
import type { Product } from "../../productModels/productModels.js";
import type { FullCustomerPrice } from "../cusPriceModels/cusPriceModels.js";
import type { CusProduct, FullCusProduct } from "../cusProductModels.js";
import type {
	CustomerEntitlement,
	FullCustomerEntitlement,
} from "./cusEntModels.js";
import type { Rollover } from "./rolloverModels/rolloverTable.js";

/**
 * The columns balance selection and deduction read. FullCustomerEntitlement satisfies it,
 * and so does a leaner row joined with its catalog rows, so one helper serves both.
 */
export type RolloverView = Pick<
	Rollover,
	"id" | "balance" | "usage" | "expires_at"
> &
	Partial<Pick<Rollover, "entities">>;

export type FullCusProductView = Pick<
	CusProduct,
	"internal_entity_id" | "entity_id" | "status"
> & { product: Pick<Product, "id" | "is_add_on"> };

export type FullCustomerEntitlementView = Pick<
	CustomerEntitlement,
	| "id"
	| "internal_feature_id"
	| "internal_entity_id"
	| "balance"
	| "additional_balance"
	| "adjustment"
	| "unlimited"
	| "usage_allowed"
	| "next_reset_at"
	| "expires_at"
	| "created_at"
	| "external_id"
> &
	Partial<
		Pick<
			CustomerEntitlement,
			| "entities"
			| "is_pooled_balance"
			| "pooled_balance_id"
			| "pooled_contribution_id"
		>
	> & {
		entitlement: EntitlementWithFeature;
		rollovers: RolloverView[];
		replaceables?: unknown[];
	};

export type FullCusEntWithFullCusProductView<
	CE extends FullCustomerEntitlementView = FullCustomerEntitlementView,
	CP extends FullCusProductView = FullCusProductView,
> = CE & { customer_product: CP | null };

/** What selection needs of a subject: its products' rows, loose rows, and which entity it views. */
export type FullSubjectView<
	CE extends FullCustomerEntitlementView = FullCustomerEntitlementView,
	CP extends FullCusProductView = FullCusProductView,
> = {
	customer?: Pick<Customer, "config">;
	entity?: Pick<Entity, "id" | "internal_id" | "feature_id"> | null;
	customer_products: (CP & { customer_entitlements: CE[] })[];
	extra_customer_entitlements: CE[];
	pooled_customer_entitlements?: CE[];
};

/** A product row with its prices: what classifying a plan and sizing a grant read. */
export type CustomerProductWithPricesView = FullCusProductView &
	Pick<CusProduct, "options" | "quantity"> & {
		customer_prices: FullCustomerPrice[];
		customer_licenses?: FullCusProduct["customer_licenses"];
	};

/** A stored row before selection attaches its product. */
export type CustomerEntitlementRowView = FullCustomerEntitlementView &
	Partial<Pick<FullCustomerEntitlement, "pooled_balance">> & {
		customer_product_id: string | null;
	};

/** A row with the product that prices it: what starting balances, overage floors and plan allowances read. */
export type CustomerEntitlementWithPricesView = CustomerEntitlementRowView & {
	customer_product: CustomerProductWithPricesView | null;
};

/** What resolving billing controls and usage windows reads of a subject: its controls, its plans, and its rows. */
export type BillingControlSubjectView<
	CE extends FullCustomerEntitlementView = FullCustomerEntitlementView,
	CP extends FullCusProductView = FullCusProductView,
> = FullSubjectView<CE, CP> & {
	customer: Pick<
		Customer,
		| "internal_id"
		| "config"
		| "spend_limits"
		| "overage_allowed"
		| "usage_limits"
	>;
	entity?:
		| (Pick<Entity, "id" | "internal_id" | "feature_id"> &
				Partial<
					Pick<Entity, "spend_limits" | "overage_allowed" | "usage_limits">
				>)
		| null;
	aggregated_customer_products?: CP[];
	aggregated_customer_entitlements?: FullSubject["aggregated_customer_entitlements"];
};
