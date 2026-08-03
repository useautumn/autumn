import type {
	Entitlement,
	EntitlementWithFeature,
	Feature,
	FullProduct,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import { enrichEntitlementsWithFeatures } from "@autumn/shared/utils/productUtils/entUtils/enrichEntitlement.js";
import {
	EnsurePricesAndEntitlementsResultSchema,
	findPreparedAddItemEntitlementPrice,
} from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/index.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import type { BatchMigrationRejection } from "../../types/index.js";

const ensurePricesAndEntitlementsKey = buildPrepareModuleKey({
	kind: "ensure_prices_and_entitlements",
	parts: ["update_plan"],
});

/** Resolves customize.add_items to the shared entitlement rows prepare created
 * for this from-product — the deterministic rows that make batch adds uniform. */
export const resolvePreparedAddItemEntitlements = ({
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
	entitlements: EntitlementWithFeature[];
	rejections: BatchMigrationRejection[];
} => {
	const addItems = op.customize?.add_items ?? [];
	if (addItems.length === 0) return { entitlements: [], rejections: [] };

	const missingRejection = ({
		message,
		details,
	}: {
		message: string;
		details?: Record<string, unknown>;
	}): BatchMigrationRejection => ({
		code: "missing_prepared_state",
		opIndex,
		planId: fromProduct.id,
		message,
		details,
	});

	const parsed = EnsurePricesAndEntitlementsResultSchema.safeParse(
		migration.prepared_state?.[ensurePricesAndEntitlementsKey],
	);
	if (!parsed.success) {
		return {
			entitlements: [],
			rejections: [
				missingRejection({
					message:
						"update_plan add_items requires prepared entitlements. Run prepare before computing.",
					details: { prepareKey: ensurePricesAndEntitlementsKey },
				}),
			],
		};
	}

	const rejections: BatchMigrationRejection[] = [];
	const entitlementRows: Entitlement[] = [];
	for (const [itemIndex, item] of addItems.entries()) {
		const entitlementRow = findPreparedAddItemEntitlementPrice({
			prepared: parsed.data,
			opIndex,
			itemIndex,
			internalProductId: fromProduct.internal_id,
			item,
		})?.entitlement;
		if (!entitlementRow) {
			rejections.push(
				missingRejection({
					message:
						"prepared_state is missing the entitlement artifact for an add_items entry. Re-run prepare.",
					details: { itemIndex, featureId: item.feature_id },
				}),
			);
			continue;
		}
		entitlementRows.push(entitlementRow);
	}
	if (rejections.length > 0) return { entitlements: [], rejections };

	return {
		entitlements: enrichEntitlementsWithFeatures({
			entitlements: entitlementRows,
			features,
		}),
		rejections: [],
	};
};
