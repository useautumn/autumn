import type { Context } from "hono";
import type { AtomHttpEnv } from "../../types/atomHttp.js";

/** One in a hundred successful answers carries its body; every failure does. */
const SUCCESS_RESPONSE_SAMPLE_RATE = 0.01;

const FORWARDED_HEADER = "x-atom-forwarded";

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Who a request was about, read from its body: a check names the customer at the top, a push inside its state. */
export const requestFieldsOf = ({
	body,
	routedCustomerId,
}: {
	body: unknown;
	/** A subject push's customer, sent beside a body left unparsed here. */
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

/** A balance's breakdown is the bulk of a check answer and says nothing its totals do not. */
const compactResponseBody = (body: unknown): unknown => {
	if (!isRecord(body) || !isRecord(body.balance)) return body;
	const { breakdown: _breakdown, ...balance } = body.balance;
	return { ...body, balance };
};

/** Whether this line carries the response: decided before anything is read, so a skipped body costs nothing. */
export const carriesResponse = ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): boolean =>
	context.res.status >= 400 || Math.random() < SUCCESS_RESPONSE_SAMPLE_RATE;

/** The JSON a response carried; a reply the API sent is never read, only its reason is logged. */
export const responseBodyOf = async ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): Promise<unknown> => {
	if (forwardedReason({ context })) return null;
	if (!context.res.headers.get("content-type")?.includes("application/json"))
		return null;
	try {
		const body = await context.res.clone().json();
		return context.res.status < 400 ? compactResponseBody(body) : body;
	} catch {
		return null;
	}
};

/** A 5xx is Atom's own fault, except an API it could not reach: that one is answered, and logged, as the caller's news. */
export const isAtomsOwnFault = ({
	statusCode,
}: {
	statusCode: number;
}): boolean => statusCode >= 500 && statusCode !== 502;

/** Only Atom's own fault is worth a stack; a refusal or an unreachable API says everything in name and message. */
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

/** Why the Autumn API answered instead of Atom, when it did. */
export const forwardedReason = ({
	context,
}: {
	context: Context<AtomHttpEnv>;
}): string | undefined =>
	context.res.headers.get(FORWARDED_HEADER) ?? undefined;
