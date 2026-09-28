import { type AxiomClient, queryApl } from "@autumn/axiom";
import { z } from "zod";
import type { HourWindow } from "../../../types/hourWindow";
import { apiRequestCatalog } from "../../apiRequestCatalog";
import type { ApiCallCount } from "../../types/apiCallCount";
import { apiCallsApl } from "../../utils/apiCallsApl";

const endpointIds = apiRequestCatalog.map((endpoint) => endpoint.id);

const apiCallCountRowSchema = z.object({
	org_id: z.string().min(1),
	org_slug: z.string().default(""),
	hour: z.string().min(1),
	endpoint_id: z.enum(endpointIds as [string, ...string[]]),
	requests: z.coerce.number().int().nonnegative(),
});

const rowToApiCallCount = (row: unknown): ApiCallCount => {
	const parsed = apiCallCountRowSchema.safeParse(row);
	if (!parsed.success) {
		const keys = row && typeof row === "object" ? Object.keys(row) : [];
		throw new Error(
			`Unexpected api_call row (keys: ${keys.join(", ")}): ${parsed.error.message}`,
		);
	}
	return {
		orgId: parsed.data.org_id,
		orgSlug: parsed.data.org_slug,
		hourStartMs: new Date(parsed.data.hour).getTime(),
		endpointId: parsed.data.endpoint_id as ApiCallCount["endpointId"],
		requests: parsed.data.requests,
	};
};

/** Requests per (org, hour, endpoint) from the request log, for the given hours. */
export const countApiCalls = async ({
	ctx,
	windows,
}: {
	ctx: { axiom: AxiomClient };
	windows: HourWindow[];
}): Promise<ApiCallCount[]> => {
	const rows = await queryApl({
		ctx,
		query: { apl: apiCallsApl({ windows }) },
	});
	return rows.map(rowToApiCallCount);
};
