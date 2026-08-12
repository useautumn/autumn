import type { Feature, FullProduct } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import {
	EnsurePlanLicensesResultSchema,
	type PreparedPlanLicenseRef,
} from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/types.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type {
	BatchMigrationLicenseEntitlementOp,
	BatchMigrationRejection,
} from "../../types/index.js";

const ensurePlanLicensesKey = buildPrepareModuleKey({
	kind: "ensure_plan_licenses",
	parts: ["update_plan"],
});

/** Traits the set-based lane cannot express. Listed once so a new verb inherits
 * every guard rather than the subset its author remembered. */
const UNSUPPORTED_LICENSE_TRAITS: {
	code: BatchMigrationRejection["code"];
	message: string;
	carries: (artifact: PreparedPlanLicenseRef) => boolean | undefined;
}[] = [
	{
		code: "priced_remove_item",
		message:
			"A paid item needs a Stripe write; only free entitlements are batch-lowered.",
		carries: (artifact) => artifact.removes_priced_item,
	},
	{
		code: "rollover_remove_item",
		message:
			"Rollover balances outlive the row they hang off; carrying them across is per-customer work.",
		carries: (artifact) => artifact.removes_rollover_item,
	},
	{
		code: "entity_scoped_entitlement",
		message:
			"Entity-scoped entitlements carry per-entity sub-balances; row counts vary per customer.",
		carries: (artifact) => artifact.removes_entity_scoped_item,
	},
	{
		code: "pooled_add_item",
		message:
			"A pooled item's anchor row hangs off no customer product, so the set-based writes never reach it.",
		carries: (artifact) =>
			artifact.adds_pooled_item || artifact.removes_pooled_item,
	},
];

export const computeBatchMigrationLicenseOperations = ({
	migration,
	op,
	opIndex,
	fromProduct,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	features: Feature[];
}): {
	operations: BatchMigrationLicenseEntitlementOp[];
	rejections: BatchMigrationRejection[];
} => {
	const upsertLicenses = op.customize?.upsert_licenses ?? [];
	if (upsertLicenses.length === 0) {
		return { operations: [], rejections: [] };
	}

	const parsed = EnsurePlanLicensesResultSchema.safeParse(
		migration.prepared_state?.[ensurePlanLicensesKey],
	);
	if (!parsed.success) {
		return {
			operations: [],
			rejections: [
				{
					code: "missing_prepared_state",
					opIndex,
					planId: fromProduct.id,
					message:
						"upsert_licenses requires prepared plan licenses. Run prepare before computing.",
					details: { prepareKey: ensurePlanLicensesKey },
				},
			],
		};
	}

	const operations: BatchMigrationLicenseEntitlementOp[] = [];
	const rejections: BatchMigrationRejection[] = [];

	for (const entry of upsertLicenses) {
		const artifacts = parsed.data.artifacts.filter(
			(artifact) =>
				artifact.op_index === opIndex &&
				artifact.license_plan_id === entry.license_plan_id &&
				artifact.parent_internal_product_id === fromProduct.internal_id,
		);
		if (artifacts.length === 0) {
			rejections.push({
				code: "missing_prepared_state",
				opIndex,
				planId: fromProduct.id,
				message:
					"prepared_state has no plan license artifact for an upsert_licenses entry. Re-run prepare.",
				details: { licensePlanId: entry.license_plan_id },
			});
			continue;
		}

		for (const artifact of artifacts) {
			const unsupported = UNSUPPORTED_LICENSE_TRAITS.find(
				({ carries }) => carries(artifact) === true,
			);
			if (unsupported) {
				rejections.push({
					code: unsupported.code,
					opIndex,
					planId: fromProduct.id,
					message: unsupported.message,
					details: {
						licensePlanId: entry.license_plan_id,
						featureId: artifact.removes_filter?.feature_id,
					},
				});
				continue;
			}

			if (artifact.removes_filter) {
				operations.push({
					type: "add_license_entitlement",
					licensePlanId: entry.license_plan_id,
					planLicenseId: artifact.plan_license_id,
					licenseInternalProductId: artifact.license_internal_product_id,
					isOneOff: artifact.is_one_off,
					kind: "remove",
					filter: artifact.removes_filter,
				});
				continue;
			}

			const entitlement = parsed.data.entitlements.find(
				(candidate) => candidate.id === artifact.entitlement_id,
			);
			if (!entitlement) {
				rejections.push({
					code: "missing_prepared_state",
					opIndex,
					planId: fromProduct.id,
					message:
						"prepared_state is missing the entitlement artifact for an upsert_licenses entry. Re-run prepare.",
					details: { licensePlanId: entry.license_plan_id },
				});
				continue;
			}

			const [enriched] = enrichEntitlementsWithFeatures({
				entitlements: [entitlement],
				features,
			});

			if (enriched.entity_feature_id) {
				rejections.push({
					code: "entity_scoped_entitlement",
					opIndex,
					planId: fromProduct.id,
					message:
						"Adding an entity-scoped entitlement fans out per entity; row counts vary per customer.",
					details: {
						licensePlanId: entry.license_plan_id,
						featureId: enriched.feature.id,
						entityFeatureId: enriched.entity_feature_id,
					},
				});
				continue;
			}

			operations.push({
				type: "add_license_entitlement",
				licensePlanId: entry.license_plan_id,
				planLicenseId: artifact.plan_license_id,
				licenseInternalProductId: artifact.license_internal_product_id,
				isOneOff: artifact.is_one_off,
				entitlement: enriched,
				initialState: computeCustomerEntitlementInitialState({
					entitlement: enriched,
				}),
				...(artifact.replaces_entitlement_id
					? {
							kind: "replace" as const,
							fromEntitlementId: artifact.replaces_entitlement_id,
						}
					: { kind: "add" as const }),
			});
		}
	}

	if (rejections.length > 0) return { operations: [], rejections };

	return { operations, rejections };
};
