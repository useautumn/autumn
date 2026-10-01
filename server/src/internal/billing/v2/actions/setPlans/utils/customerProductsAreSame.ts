import type { Feature, FullCusProduct } from "@autumn/shared";
import { customerProductToInstanceConfig } from "../timeline/instanceConfig/instanceConfigs";
import { instanceConfigsMatch } from "../timeline/instanceConfig/instanceConfigsMatch";

/** Two customer products grant the same plan, using the equality billing uses to keep a plan untouched. */
export const customerProductsAreSame = ({
	features,
	before,
	after,
}: {
	features: Feature[];
	before: FullCusProduct;
	after: FullCusProduct;
}) =>
	(before.internal_entity_id ?? null) === (after.internal_entity_id ?? null) &&
	instanceConfigsMatch({
		features,
		first: customerProductToInstanceConfig({
			customerProduct: before,
			now: before.starts_at,
		}),
		second: customerProductToInstanceConfig({
			customerProduct: after,
			now: after.starts_at,
		}),
	});
