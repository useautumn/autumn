import type {
	CusProductStatus,
	FeatureOptions,
	ProductV2,
} from "@autumn/shared";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { compareMainProduct } from "../compare.js";
import ctx from "../testInitUtils/createTestContext.js";

/**
 * Compares V0.1 API customer response against V2 product definition
 *
 * Converts ProductV2.items → entitlements + prices using production utilities,
 * then delegates to existing compareMainProduct for validation.
 *
 * @param sent - V2 product definition with items
 * @param cusRes - V0.1 customer API response
 * @param status - Expected product status
 * @param optionsList - Feature options for quantity adjustments
 */
export const expectCustomerV0Correct = async ({
	sent,
	cusRes,
	status,
	optionsList,
}: {
	sent: ProductV2;
	cusRes: any; // V0.1 customer response
	status?: CusProductStatus;
	optionsList?: FeatureOptions[];
}) => {
	const { org, features } = ctx;

	// Convert V2 → V1 using production utilities
	const sentV1 = convertProductV2ToV1({
		productV2: sent,
		orgId: org.id,
		features,
	});

	// Use existing compareMainProduct
	return compareMainProduct({
		sent: sentV1,
		cusRes,
		status,
		optionsList,
	});
};
