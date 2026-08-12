import {
	type Feature,
	type FullProduct,
	mapToProductV2,
	type PlanChangeV0,
	productV2ToApiPlanV1,
} from "@autumn/shared";
import { buildPlanChange } from "./buildPlanChange.js";

const toApiPlanV1 = ({
	product,
	features,
}: {
	product: FullProduct;
	features?: Feature[];
}) => {
	const resolvedFeatures =
		features ?? product.entitlements.map((entitlement) => entitlement.feature);
	return productV2ToApiPlanV1({
		product: mapToProductV2({ product, features: resolvedFeatures }),
		features: resolvedFeatures,
	});
};

/** Full-product orchestrator over the plan-change kernel: convert both sides
 * to ApiPlanV1, then diff. Undefined when the definitions are identical. */
export const buildPlanChangeFromFullProducts = ({
	from,
	to,
	features,
}: {
	from: FullProduct;
	to: FullProduct;
	features?: Feature[];
}): PlanChangeV0 | undefined =>
	buildPlanChange({
		from: toApiPlanV1({ product: from, features }),
		to: toApiPlanV1({ product: to, features }),
	});
