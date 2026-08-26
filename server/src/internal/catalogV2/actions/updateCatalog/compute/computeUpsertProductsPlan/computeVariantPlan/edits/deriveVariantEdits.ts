import type { UpdateCatalogPlanParams } from "@autumn/shared";
import { isEmptyObject, productToProductKey } from "@autumn/shared";
import type {
	ProductUpsertIntent,
	UpsertProductPlan,
} from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { buildVariantEditDiff } from "../editDiff/buildVariantEditDiff";
import type { VariantEditTarget } from "../targets/variantEditTarget";
import { baseRowMinted } from "../variantPlanUtils";

/** Where this target's pointer moves. `undefined` leaves it untouched. */
const resolveTargetPointer = ({
	target,
	upsert,
	newBasePointer,
}: {
	target: VariantEditTarget;
	upsert: UpsertProductPlan;
	newBasePointer: string | undefined;
}): string | null | undefined => {
	if (target.unlink) return null;
	if (target.declared) return upsert.row.nextFullProduct.internal_id;
	// existing/all_versions: pinned historical rows keep their anchor.
	// new_version: the one resolved row always re-anchors.
	if (target.follow) {
		if (upsert.row.versioning === "new_version") return newBasePointer;
		return target.row.active ? newBasePointer : undefined;
	}
	return undefined;
};

/** One target row → one intent, or undefined when nothing would change. */
const buildVariantEditIntent = ({
	target,
	upsert,
	settingsPatch,
	newBasePointer,
}: {
	target: VariantEditTarget;
	upsert: UpsertProductPlan;
	settingsPatch: Partial<UpdateCatalogPlanParams>;
	newBasePointer: string | undefined;
}): ProductUpsertIntent | undefined => {
	const editDiff = buildVariantEditDiff({
		variantProduct: target.row,
		baseCurrent: upsert.row.currentFullProduct ?? upsert.row.baseFullProduct,
		baseNext: upsert.row.nextFullProduct,
		follow: target.follow === true,
		customize: target.customize,
		declaredLicenses: upsert.declaredLicenses,
	});
	const hasSettings = !isEmptyObject(settingsPatch);
	const pointer = resolveTargetPointer({ target, upsert, newBasePointer });
	const pointerChanged =
		pointer !== undefined && pointer !== target.row.base_internal_product_id;

	if (
		!editDiff &&
		!hasSettings &&
		!pointerChanged &&
		target.archived === undefined &&
		target.processors === undefined
	) {
		return undefined;
	}

	const pointerIsOnlyChange =
		!target.follow &&
		!editDiff &&
		!hasSettings &&
		pointerChanged &&
		target.archived === undefined &&
		target.processors === undefined;

	return {
		productKey: productToProductKey({ product: target.row }),
		planParams: {
			plan_id: target.row.id,
			version: target.row.version,
			...settingsPatch,
			...(target.archived !== undefined ? { archived: target.archived } : {}),
			...(target.processors !== undefined
				? { processors: target.processors }
				: {}),
			...(target.unlink ? { base_variant_id: null } : {}),
		},
		source: pointerIsOnlyChange
			? ("repoint" as const)
			: ("variant_propagation" as const),
		...(editDiff ? { editDiff } : {}),
		...(pointerChanged && pointer !== null
			? { baseInternalProductId: pointer }
			: {}),
		...(target.unlink ? { unlink: true } : {}),
	};
};

/** In-place writes on targeted variant rows: content, settings, pointer, archive. */
export const deriveVariantEdits = ({
	upsert,
	targets,
	settingsPatch,
}: {
	upsert: UpsertProductPlan;
	targets: VariantEditTarget[];
	settingsPatch: Partial<UpdateCatalogPlanParams>;
}): ProductUpsertIntent[] => {
	const nextIsActive = upsert.row.nextFullProduct.active;
	const movesActivePointer =
		nextIsActive &&
		(baseRowMinted({ upsert }) || upsert.previousActiveInternalId != null);
	const newBasePointer = movesActivePointer
		? upsert.row.nextFullProduct.internal_id
		: undefined;

	return targets.flatMap(
		(target) =>
			buildVariantEditIntent({
				target,
				upsert,
				settingsPatch,
				newBasePointer,
			}) ?? [],
	);
};
