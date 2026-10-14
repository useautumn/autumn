import type { FullProduct, FullProductWithoutLicenses } from "@autumn/shared";
import type { OperationScope } from "../scope/operationScope.js";
import type { BatchMigrationOperations } from "./batchMigrationOperations.js";

export type BatchMigrationRejectionCode =
	| "billing_changes_not_disabled"
	| "missing_operations"
	| "unsupported_operation_type"
	| "proration_enabled"
	| "feature_quantity_strategy"
	| "deprecated_update_items"
	| "unsupported_remove_items"
	| "unsupported_upsert_licenses"
	| "unsupported_version_only"
	| "base_price_customize"
	| "priced_add_item"
	| "priced_remove_item"
	| "rollover_remove_item"
	| "unsupported_upsert_licenses"
	| "unsupported_plan_filter"
	| "no_matched_products"
	| "missing_target_version"
	| "missing_prepared_state"
	| "base_price_transition"
	| "free_trial_transition"
	| "paid_entitlement_transition"
	| "entity_scoped_entitlement"
	| "pooled_add_item"
	| "license_link_transition"
	| "overlapping_operations";

export type BatchMigrationRejection = {
	code: BatchMigrationRejectionCode;
	message: string;
	opIndex?: number;
	planId?: string;
	details?: Record<string, unknown>;
};

export type BatchMigrationPatch = {
	opIndex: number;
	planId: string;
	scope: OperationScope;
	fromProduct: FullProduct;
	toProduct: FullProductWithoutLicenses;
	operations: BatchMigrationOperations;
};

export type BatchMigrationPlan = {
	patches: BatchMigrationPatch[];
};

export type BatchMigrationComputeResult =
	| { computable: true; plan: BatchMigrationPlan }
	| { computable: false; rejections: BatchMigrationRejection[] };
