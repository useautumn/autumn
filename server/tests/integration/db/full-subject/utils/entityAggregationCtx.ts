import { ApiVersion, ApiVersionClass } from "@autumn/shared";
import ctx from "@tests/utils/testInitUtils/createTestContext.js";

/** Customer-scoped entity aggregation only runs for API V2_3 and earlier. */
export const entityAggregationCtx = {
	...ctx,
	apiVersion: new ApiVersionClass(ApiVersion.V2_3),
};
