import type { Customer } from "../../cusModels/cusModels.js";
import type { Entity } from "../../cusModels/entityModels/entityModels.js";
import type { EntitlementWithFeature } from "../../productModels/entModels/entModels.js";
import type { Product } from "../../productModels/productModels.js";
import type { CusProduct } from "../cusProductModels.js";
import type { CustomerEntitlement } from "./cusEntModels.js";
import type { Rollover } from "./rolloverModels/rolloverTable.js";

/**
 * The columns balance selection and deduction read. FullCustomerEntitlement satisfies it,
 * and so does a leaner row joined with its catalog rows, so one helper serves both.
 */
export type RolloverView = Pick<Rollover, "balance" | "usage" | "expires_at"> &
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
