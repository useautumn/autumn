import { type FullCustomer } from "@autumn/shared";
import type { RequestContext } from "@/honoUtils/HonoEnv.js";
import { getApiCusFeatures } from "./getApiCusFeature/getApiCusFeatures.js";

export const getApiCustomer = async ({
	ctx,
	fullCus,
}: {
	ctx: RequestContext;
	fullCus: FullCustomer;
}) => {
	console.log(`[getApiCustomer] Getting features for customer ${fullCus.id}`);
	const apiCusFeatures = await getApiCusFeatures({
		ctx,
		fullCus,
	});
	return {
		features: apiCusFeatures,
	};
};
