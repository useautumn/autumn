import type {
	CusProductStatus,
	FeatureOptions,
	ProductV2,
} from "@autumn/shared";
import { convertProductV2ToV1 } from "@/internal/products/productUtils/productV2Utils/convertProductV2ToV1.js";
import { compareMainProduct } from "../compare.js";
import ctx from "../testInitUtils/createTestContext.js";

export const expectCustomerV0Correct = async ({
	sent,
	cusRes,
	status,
	optionsList,
	skipEntitlements,
}: {
	sent: ProductV2;
	cusRes: any;
	status?: CusProductStatus;
	optionsList?: FeatureOptions[];
	skipEntitlements?: boolean;
}) => {
	const { org, features } = ctx;

	const sentV1 = convertProductV2ToV1({
		productV2: sent,
		orgId: org.id,
		features,
	});

	return compareMainProduct({
		sent: sentV1,
		cusRes,
		status,
		optionsList,
		skipEntitlements,
	});
};
