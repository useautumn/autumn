import type {
	Feature,
	FullProduct,
	Organization,
	Product,
	ProductV2,
} from "@autumn/shared";
import { getEntsWithFeature } from "@/internal/products/entitlements/entitlementUtils.js";
import { convertProductV2ToV1 } from "./convertProductV2ToV1.js";

export const buildFullProductFromV2 = ({
	product,
	base,
	org,
	features,
}: {
	product: ProductV2;
	base: Product;
	org: Organization;
	features: Feature[];
}): FullProduct => {
	const { prices, entitlements } = convertProductV2ToV1({
		productV2: product,
		orgId: org.id,
		features,
	});
	return {
		...base,
		prices,
		entitlements: getEntsWithFeature({
			ents: Object.values(entitlements),
			features,
		}),
		free_trial: null,
	};
};
