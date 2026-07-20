import {
	type ApiPlanV1,
	type DiffedCustomizePlanV1,
	ErrCode,
	type FullProduct,
	products,
	RecaseError,
	type UpdateVariantParams,
} from "@autumn/shared";
import { inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	applyDiffToVariantPlan,
	fullProductToApiPlanV1,
	getApiPlanDiff,
	getVariantSettingsPatch,
	omitVariantOwnedSettings,
	variantSettingsPatchHasValues,
} from "../common/planTransformUtils.js";
import { createVariant } from "../createVariant/createVariant.js";
import { hasPlanCustomers } from "../previewUpdatePlan/hasPlanCustomers.js";
import { getVariantPropagationTargets } from "./getVariantPropagationTargets.js";
import { updateVariant } from "./updateVariant.js";

type VariantUpdateJob = {
	variant: FullProduct;
	diff?: DiffedCustomizePlanV1;
	targetPlan?: ApiPlanV1;
	wasCreated?: boolean;
};

const validateVariantUpdates = (variantUpdates: UpdateVariantParams[]) => {
	for (const variantUpdate of variantUpdates) {
		if (variantUpdate.force_version && variantUpdate.disable_version) {
			throw new RecaseError({
				message: "Cannot use both force_version and disable_version",
				code: ErrCode.ConflictingVersionFlags,
				statusCode: 400,
			});
		}
	}
};

const buildVariantUpdateIndex = (variantUpdates: UpdateVariantParams[]) =>
	new Map(
		variantUpdates.map((variantUpdate) => [
			variantUpdate.variant_plan_id,
			variantUpdate,
		]),
	);

// The base plan's rows belong to a different product; carrying their ids into
// the variant would insert entitlements/prices that collide with the base's.
const stripBasePlanRowIds = (plan: ApiPlanV1): ApiPlanV1 => ({
	...plan,
	price: plan.price
		? (({ entitlement_id: _entitlementId, price_id: _priceId, ...rest }) =>
				rest)(plan.price)
		: plan.price,
	items: plan.items.map(
		({ entitlement_id: _entitlementId, price_id: _priceId, ...rest }) => rest,
	),
});

const buildVariantTargetPlan = ({
	incomingBasePlan,
	variant,
	variantUpdate,
}: {
	incomingBasePlan: ApiPlanV1;
	variant: FullProduct;
	variantUpdate: UpdateVariantParams;
}): ApiPlanV1 => ({
	...stripBasePlanRowIds(
		applyDiffToVariantPlan({
			plan: incomingBasePlan,
			diff: variantUpdate.customize,
		}),
	),
	id: variant.id,
	name: variantUpdate.name ?? variant.name,
});

const ensureMissingVariantName = ({
	missingVariantId,
	variantUpdate,
}: {
	missingVariantId: string;
	variantUpdate?: UpdateVariantParams;
}): string => {
	if (variantUpdate?.name) return variantUpdate.name;

	throw new RecaseError({
		message: `Variant ${missingVariantId} does not exist. Provide name to create it.`,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: 400,
	});
};

const buildSelectedVariantJobs = ({
	baseDiff,
	incomingBasePlan,
	selectedVariants,
	variantUpdateById,
}: {
	baseDiff: DiffedCustomizePlanV1;
	incomingBasePlan: ApiPlanV1;
	selectedVariants: FullProduct[];
	variantUpdateById: Map<string, UpdateVariantParams>;
}): Map<string, VariantUpdateJob> => {
	const jobs = new Map<string, VariantUpdateJob>();

	for (const variant of selectedVariants) {
		const variantUpdate = variantUpdateById.get(variant.id);
		jobs.set(variant.id, {
			variant,
			...(variantUpdate
				? {
						targetPlan: buildVariantTargetPlan({
							incomingBasePlan,
							variant,
							variantUpdate,
						}),
					}
				: { diff: baseDiff }),
		});
	}

	return jobs;
};

const addSettingsPropagationJobs = ({
	allVariants,
	jobs,
}: {
	allVariants: FullProduct[];
	jobs: Map<string, VariantUpdateJob>;
}) => {
	for (const variant of allVariants) {
		if (variant.archived || jobs.has(variant.id)) continue;
		jobs.set(variant.id, { variant, diff: {} });
	}
};

const moveLatestVariantsToBaseVersion = async ({
	ctx,
	variants,
	newBase,
	skipVariantIds,
}: {
	ctx: AutumnContext;
	variants: FullProduct[];
	newBase: FullProduct;
	skipVariantIds: Set<string>;
}) => {
	const variantInternalIds: string[] = [];
	for (const variant of variants) {
		if (variant.archived) continue;
		if (skipVariantIds.has(variant.id)) continue;
		if (variant.base_internal_product_id === newBase.internal_id) continue;
		variantInternalIds.push(variant.internal_id);
	}
	if (variantInternalIds.length === 0) return;

	await ctx.db
		.update(products)
		.set({ base_internal_product_id: newBase.internal_id })
		.where(inArray(products.internal_id, variantInternalIds));
};

export const updateVariants = async ({
	ctx,
	oldBase,
	newBase,
	propagateToVariants,
	variantUpdates = [],
	disableVersion,
	forceVersion,
	allVersions,
}: {
	ctx: AutumnContext;
	oldBase: FullProduct;
	newBase: FullProduct;
	propagateToVariants: string[];
	variantUpdates?: UpdateVariantParams[];
	disableVersion?: boolean;
	forceVersion?: boolean;
	allVersions?: boolean;
}) => {
	validateVariantUpdates(variantUpdates);

	const variantUpdateById = buildVariantUpdateIndex(variantUpdates);
	const targetVariantIds = [
		...new Set([...propagateToVariants, ...variantUpdateById.keys()]),
	];

	const [currentBasePlan, incomingBasePlan, variants] = await Promise.all([
		fullProductToApiPlanV1({ ctx, product: oldBase }),
		fullProductToApiPlanV1({ ctx, product: newBase }),
		getVariantPropagationTargets({
			ctx,
			oldBase,
			propagateToVariants: targetVariantIds,
			missingAllowedIds: new Set(variantUpdateById.keys()),
		}),
	]);

	const baseDiff = getApiPlanDiff({
		from: currentBasePlan,
		to: incomingBasePlan,
	});
	const settingsPatch = omitVariantOwnedSettings(
		getVariantSettingsPatch({
			from: currentBasePlan,
			to: incomingBasePlan,
		}),
	);
	const hasSettingsPatch = variantSettingsPatchHasValues(settingsPatch);
	const baseWasVersioned = oldBase.internal_id !== newBase.internal_id;
	if (targetVariantIds.length === 0 && !hasSettingsPatch) {
		if (baseWasVersioned) {
			await moveLatestVariantsToBaseVersion({
				ctx,
				variants: variants.allVariants,
				newBase,
				skipVariantIds: new Set(),
			});
		}
		return;
	}

	const resolveShouldVersion = async (
		variant: FullProduct,
		variantUpdate?: UpdateVariantParams,
	): Promise<boolean> => {
		if (variantUpdate?.force_version) return true;
		if (variantUpdate?.disable_version) return false;
		if (forceVersion) return true;
		if (disableVersion || allVersions) return false;
		return hasPlanCustomers({ ctx, product: variant });
	};

	const jobs = buildSelectedVariantJobs({
		baseDiff,
		incomingBasePlan,
		selectedVariants: variants.variants,
		variantUpdateById,
	});
	if (hasSettingsPatch) {
		addSettingsPropagationJobs({
			allVariants: variants.allVariants,
			jobs,
		});
	}

	for (const missingVariantId of variants.missingVariantIds) {
		const variantUpdate = variantUpdateById.get(missingVariantId);
		const name = ensureMissingVariantName({ missingVariantId, variantUpdate });

		const variant = await createVariant({
			ctx,
			data: {
				base_plan_id: newBase.id,
				variant_plan_id: missingVariantId,
				name,
			},
			initialBaseProduct: newBase,
		});
		jobs.set(variant.id, {
			variant,
			targetPlan: variantUpdate
				? buildVariantTargetPlan({
						incomingBasePlan,
						variant,
						variantUpdate,
					})
				: undefined,
			diff: variantUpdate ? undefined : baseDiff,
			wasCreated: true,
		});
	}

	const versionedVariantIds = new Set<string>();
	for (const { variant, diff, targetPlan, wasCreated } of jobs.values()) {
		const variantUpdate = variantUpdateById.get(variant.id);
		const shouldVersion =
			wasCreated && !variantUpdate?.force_version
				? false
				: await resolveShouldVersion(variant, variantUpdate);
		if (shouldVersion) versionedVariantIds.add(variant.id);

		await updateVariant({
			ctx,
			variant,
			diff,
			targetPlan,
			settingsPatch,
			shouldVersion,
			baseInternalProductId: baseWasVersioned ? newBase.internal_id : undefined,
			allVersions,
			variantUpdate,
		});
	}

	if (baseWasVersioned) {
		await moveLatestVariantsToBaseVersion({
			ctx,
			variants: variants.allVariants,
			newBase,
			skipVariantIds: versionedVariantIds,
		});
	}
};
