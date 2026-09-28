import type { ApiEndpointId } from "../apiRequestCatalog";

/** Requests one org made to one endpoint within one clock hour. */
export type ApiCallCount = {
	orgId: string;
	orgSlug: string;
	hourStartMs: number;
	endpointId: ApiEndpointId;
	requests: number;
};
