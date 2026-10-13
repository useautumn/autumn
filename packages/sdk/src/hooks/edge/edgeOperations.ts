/** The request body as sent, in snake case. */
type WireBody = { send_event?: unknown; lock?: unknown };

/** What the edge serves, by operationID. A write never goes there, so a fallback can't make it land twice. */
const EDGE_OPERATIONS: Record<
	string,
	{ isWrite?: (body: WireBody) => boolean }
> = {
	check: {
		isWrite: (body) => body.send_event === true || body.lock !== undefined,
	},
};

const parseBody = (body: RequestInit["body"]): WireBody => {
	if (typeof body !== "string") return {};
	try {
		return JSON.parse(body);
	} catch {
		return {};
	}
};

/** Whether this call is one the edge answers: a listed operation, and not a write. */
export const isEdgeOperation = ({
	operationID,
	body,
}: {
	operationID: string;
	body: RequestInit["body"];
}): boolean => {
	const operation = EDGE_OPERATIONS[operationID];
	if (!operation) return false;
	return !operation.isWrite?.(parseBody(body));
};
