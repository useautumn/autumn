import type { Context } from "hono";
import type { AtomHttpEnv } from "../../types/atomHttp.js";

const FORWARDED_HEADER = "x-atom-forwarded";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const requestFieldsOf = ({
	body,
	routedCustomerId,
}: {
	body: unknown;
	routedCustomerId?: string;
}): Record<string, unknown> => {
	if (!isRecord(body))
		return routedCustomerId ? { customer_id: routedCustomerId } : {};
	const identity = isRecord(body.state) ? body.state.identity : undefined;
	const named = isRecord(identity)
		? { customer_id: identity.customerId, entity_id: identity.entityId }
		: {
				customer_id: body.customer_id,
				entity_id: body.entity_id,
				feature_id: body.feature_id,
			};
	return {
		...named,
		...(body.log_offset !== undefined && { log_offset: body.log_offset }),
		...(Array.isArray(body.rows) && { catalog_rows: body.rows.length }),
	};
};

export const loggedResponseOf = async ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): Promise<unknown> => {
	if (context.res.status < 400) {
		const allowed = context.get("allowed");
		return allowed === undefined ? null : { allowed };
	}
	if (forwardedReason({ context })) return null;
	if (!context.res.headers.get("content-type")?.includes("application/json"))
		return null;
	try {
		return await context.res.clone().json();
	} catch {
		return null;
	}
};

export const isAtomsOwnFault = ({
	statusCode,
}: {
	statusCode: number;
}): boolean => statusCode >= 500 && statusCode !== 502;

export const loggedErrorOf = ({
	error,
	statusCode,
}: {
	error: Error;
	statusCode: number;
}): Error | { name: string; message: string } =>
	isAtomsOwnFault({ statusCode })
		? error
		: { name: error.name, message: error.message };

export const forwardedReason = ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): string | undefined =>
	context.res.headers.get(FORWARDED_HEADER) ?? undefined;
