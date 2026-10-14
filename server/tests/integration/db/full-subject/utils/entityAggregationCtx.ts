import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";

export const entityAggregationCtx = {
	...ctx,
	apiVersion: new ApiVersionClass(ApiVersion.V2_3),
};
