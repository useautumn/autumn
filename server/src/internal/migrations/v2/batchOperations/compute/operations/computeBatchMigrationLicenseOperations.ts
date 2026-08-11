import type { Feature, FullProduct } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import { computeCustomerEntitlementInitialState } from "@/internal/billing/v2/actions/batchTransition/compute/operations/entitlementPriceOperations/computeCustomerEntitlementPatch.js";
import { EnsurePlanLicensesResultSchema } from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/types.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type {
	BatchMigrationAddLicenseEntitlementOp,
	BatchMigrationRejection,
} from "../../types/index.js";

const ensurePlanLicensesKey = buildPrepareModuleKey({
	kind: "ensure_plan_licenses",
	parts: ["update_plan"],
});

/** Lowers customize.upsert_licenses into per-license add operations, using the
 * shared entitlement rows prepare minted for this parent product. */
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
	operations: BatchMigrationAddLicenseEntitlementOp[];
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

	const operations: BatchMigrationAddLicenseEntitlementOp[] = [];
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
					code: "entity_scoped_entitlement_add",
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
				supersedesEntitlementId: artifact.supersedes_entitlement_id,
			});
		}
	}

	if (rejections.length > 0) return { operations: [], rejections };

	return { operations, rejections };
};
