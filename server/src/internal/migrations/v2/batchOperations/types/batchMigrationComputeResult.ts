import type { FullProduct, FullProductWithoutLicenses } from "@autumn/shared";
import type { OperationScope } from "../scope/operationScope.js";
import type { BatchMigrationOperations } from "./batchMigrationOperations.js";

export type BatchMigrationRejectionCode =
	// Migration-level
	| "billing_changes_not_disabled"
	| "missing_operations"
	| "unsupported_operation_type"
	// Op-level (scalar guards)
	| "version_update"
	| "proration_enabled"
	| "feature_quantity_strategy"
	| "deprecated_update_items"
	| "unsupported_remove_items"
	| "base_price_customize"
	| "priced_add_item"
	| "unsupported_plan_filter"
	// Group-level (compute output guards)
	| "no_matched_products"
	| "missing_prepared_state"
	| "base_price_transition"
	| "paid_entitlement_transition"
	| "entity_scoped_entitlement_add"
	| "non_add_operation"
	| "overlapping_operations";

/**
 * Why an operation (or the whole migration) cannot be batch-lowered. One
 * rejection anywhere routes the entire migration to the per-customer lane —
 * rejections are collected exhaustively (not first-failure) so the full
 * picture is auditable/loggable.
 */
export type BatchMigrationRejection = {
	code: BatchMigrationRejectionCode;
	message: string;
	opIndex?: number;
	planId?: string;
	details?: Record<string, unknown>;
};

/** One uniform unit of batch work: every active customer product on
 * `fromProduct` receives the same set-based operations. `toProduct` is the
 * synthetic add-items projection, kept for audit/logging only. */
export type BatchMigrationPatch = {
	opIndex: number;
	planId: string;
	/** The plan filter's lowered row-level residue this patch executes against. */
	scope: OperationScope;
	fromProduct: FullProduct;
	toProduct: FullProductWithoutLicenses;
	operations: BatchMigrationOperations;
};

export type BatchMigrationPlan = {
	patches: BatchMigrationPatch[];
};

/**
 * `computable: true` with zero patches means every operation is a provable
 * no-op for every catalog product it matches.
 */
export type BatchMigrationComputeResult =
	| { computable: true; plan: BatchMigrationPlan }
	| { computable: false; rejections: BatchMigrationRejection[] };
