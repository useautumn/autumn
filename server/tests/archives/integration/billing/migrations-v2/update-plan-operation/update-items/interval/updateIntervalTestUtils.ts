import type { ApiCustomerV5, ApiEntityV2 } from "@autumn/shared";
import {
	getBalanceBucket,
	getBalanceBuckets,
} from "@tests/integration/utils/getBalanceBucket";
import { TestFeature } from "@tests/setup/v2Features";
import { constructFeatureItem } from "@/utils/scriptUtils/constructItem";

export const lifetimeCredits = ({
	includedUsage = 50,
}: {
	includedUsage?: number;
} = {}) =>
	constructFeatureItem({
		featureId: TestFeature.Credits,
		includedUsage,
		interval: null,
	});

export const getCreditBuckets = (subject: ApiCustomerV5 | ApiEntityV2) =>
	getBalanceBuckets({ subject, featureId: TestFeature.Credits });

export const getCreditBucket = (
	params: Omit<Parameters<typeof getBalanceBucket>[0], "featureId">,
) => getBalanceBucket({ ...params, featureId: TestFeature.Credits });
