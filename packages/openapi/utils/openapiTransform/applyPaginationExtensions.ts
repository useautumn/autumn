/**
 * Stamps `x-speakeasy-pagination` on operations whose request body has
 * a `cursor` string field plus a `limit` integer field. Detection is
 * shape-based so new paginated routes get SDK pagination automatically.
 *
 * Locked field names: `cursor` in, `next_cursor` out.
 */
export function applyPaginationExtensions({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}): void {
	const paths = openApiDocument.paths as Record<string, unknown> | undefined;
	if (!paths || typeof paths !== "object") return;

	for (const pathItem of Object.values(paths)) {
		if (!pathItem || typeof pathItem !== "object") continue;

		for (const op of Object.values(pathItem as Record<string, unknown>)) {
			if (!op || typeof op !== "object") continue;
			if (!hasCursorPaginationShape(op as Record<string, unknown>)) continue;

			(op as Record<string, unknown>)["x-speakeasy-pagination"] = {
				type: "cursor",
				inputs: [
					{ name: "cursor", in: "requestBody", type: "cursor" },
					{ name: "limit", in: "requestBody", type: "limit" },
				],
				outputs: { nextCursor: "$.next_cursor" },
			};
		}
	}
}

const hasCursorPaginationShape = (op: Record<string, unknown>): boolean => {
	const requestBody = op.requestBody as Record<string, unknown> | undefined;
	const content = requestBody?.content as Record<string, unknown> | undefined;
	const json = content?.["application/json"] as
		| Record<string, unknown>
		| undefined;
	const schema = json?.schema as Record<string, unknown> | undefined;
	const props = schema?.properties as Record<string, unknown> | undefined;
	if (!props) return false;

	const cursorProp = props.cursor as Record<string, unknown> | undefined;
	const limitProp = props.limit as Record<string, unknown> | undefined;
	if (!cursorProp || !limitProp) return false;

	if (cursorProp.type !== "string") return false;
	if (limitProp.type !== "integer" && limitProp.type !== "number") return false;

	return true;
};
