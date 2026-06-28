import type { FullProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	fullProductToApiPlanV1,
	getApiPlanDiff,
} from "../common/planTransformUtils.js";
import { hasPlanCustomers } from "../previewUpdatePlan/hasPlanCustomers.js";
import { getVariantPropagationTargets } from "./getVariantPropagationTargets.js";
import { updateVariant } from "./updateVariant.js";

export const updateVariants = async ({
	ctx,
	oldBase,
	newBase,
	propagateToVariants,
	disableVersion,
	forceVersion,
}: {
	ctx: AutumnContext;
	oldBase: FullProduct;
	newBase: FullProduct;
	propagateToVariants: string[];
	disableVersion?: boolean;
	forceVersion?: boolean;
}) => {
	if (propagateToVariants.length === 0) return;

	const [currentBasePlan, incomingBasePlan, variants] = await Promise.all([
		fullProductToApiPlanV1({ ctx, product: oldBase }),
		fullProductToApiPlanV1({ ctx, product: newBase }),
		getVariantPropagationTargets({
			ctx,
			oldBase,
			propagateToVariants,
		}),
	]);

	const diff = getApiPlanDiff({
		from: currentBasePlan,
		to: incomingBasePlan,
	});
	const baseWasVersioned = oldBase.internal_id !== newBase.internal_id;

	const resolveShouldVersion = async (
		variant: FullProduct,
	): Promise<boolean> => {
		if (forceVersion) return true;
		if (disableVersion) return false;
		return (
			baseWasVersioned || (await hasPlanCustomers({ ctx, product: variant }))
		);
	};

	for (const variant of variants) {
		const shouldVersion = await resolveShouldVersion(variant);

		await updateVariant({
			ctx,
			variant,
			diff,
			shouldVersion,
			baseInternalProductId: baseWasVersioned ? newBase.internal_id : undefined,
		});
	}
};
