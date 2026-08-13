import type { Feature, FullProduct } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import type { ComputedEntitlementPriceTransitions } from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeEntitlementPriceTransitions.js";
import type { PreparedPlanLicenseRef } from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/types.js";
import { EnsurePlanLicensesResultSchema } from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/types.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationRejection } from "../../types/index.js";
import { computeLicenseProductTransitions } from "./computeLicenseProductTransitions.js";

const ensurePlanLicensesKey = buildPrepareModuleKey({
	kind: "ensure_plan_licenses",
	parts: ["update_plan"],
});

/** One customized link's diff, plus the identity and prepared traits the
 * entitlement-level transitions cannot carry on their own. */
export type LicenseLinkTransitions = {
	licensePlanId: string;
	planLicenseId: string;
	licenseInternalProductId: string;
	isOneOff: boolean;
	artifacts: PreparedPlanLicenseRef[];
	transitions: ComputedEntitlementPriceTransitions;
};

const missingPreparedState = ({
	opIndex,
	planId,
	message,
	details,
}: {
	opIndex: number;
	planId: string;
	message: string;
	details: Record<string, string>;
}): BatchMigrationRejection => ({
	code: "missing_prepared_state",
	opIndex,
	planId,
	message,
	details,
});

/** Resolves customize.upsert_licenses into one diff per link, without judging
 * whether any of it can be batch-lowered -- that is the guard's call. Only an
 * unresolvable artifact rejects here, because prepare must run again. */
export const resolveLicenseCustomizeTransitions = ({
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
	links: LicenseLinkTransitions[];
	rejections: BatchMigrationRejection[];
} => {
	const upsertLicenses = op.customize?.upsert_licenses ?? [];
	if (upsertLicenses.length === 0) return { links: [], rejections: [] };

	const parsed = EnsurePlanLicensesResultSchema.safeParse(
		migration.prepared_state?.[ensurePlanLicensesKey],
	);
	if (!parsed.success) {
		return {
			links: [],
			rejections: [
				missingPreparedState({
					opIndex,
					planId: fromProduct.id,
					message:
						"upsert_licenses requires prepared plan licenses. Run prepare before computing.",
					details: { prepareKey: ensurePlanLicensesKey },
				}),
			],
		};
	}

	const links: LicenseLinkTransitions[] = [];
	const rejections: BatchMigrationRejection[] = [];

	for (const entry of upsertLicenses) {
		const artifacts = parsed.data.artifacts.filter(
			(artifact) =>
				artifact.op_index === opIndex &&
				artifact.license_plan_id === entry.license_plan_id &&
				artifact.parent_internal_product_id === fromProduct.internal_id,
		);
		if (artifacts.length === 0) {
			rejections.push(
				missingPreparedState({
					opIndex,
					planId: fromProduct.id,
					message:
						"prepared_state has no plan license artifact for an upsert_licenses entry. Re-run prepare.",
					details: { licensePlanId: entry.license_plan_id },
				}),
			);
			continue;
		}

		const mintedEntitlements = enrichEntitlementsWithFeatures({
			entitlements: parsed.data.entitlements.filter((entitlement) =>
				artifacts.some(
					(artifact) => artifact.entitlement_id === entitlement.id,
				),
			),
			features,
		});
		const removedInternalFeatureIds = artifacts.flatMap((artifact) =>
			artifact.removes_filter ? [artifact.internal_feature_id] : [],
		);

		const [first] = artifacts;
		const fromLicenseProduct = fromProduct.licenses?.find(
			(link) => link.product.id === entry.license_plan_id,
		)?.product;
		if (!fromLicenseProduct) {
			rejections.push(
				missingPreparedState({
					opIndex,
					planId: fromProduct.id,
					message:
						"the parent plan no longer links the license an upsert_licenses entry names. Re-run prepare.",
					details: { licensePlanId: entry.license_plan_id },
				}),
			);
			continue;
		}

		links.push({
			licensePlanId: entry.license_plan_id,
			planLicenseId: first.plan_license_id,
			licenseInternalProductId: first.license_internal_product_id,
			isOneOff: first.is_one_off,
			artifacts,
			transitions: computeLicenseProductTransitions({
				fromLicenseProduct,
				mintedEntitlements,
				removedInternalFeatureIds,
			}),
		});
	}

	return { links, rejections };
};
