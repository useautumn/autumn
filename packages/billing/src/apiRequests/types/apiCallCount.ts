import type { ApiEndpointId } from "../apiRequestCatalog";

export type ApiCallCount = {
	orgId: string;
	orgSlug: string;
	hourStartMs: number;
	endpointId: ApiEndpointId;
	requests: number;
};
