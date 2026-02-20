/**
 * Type guard to check if a value is a plain object (not array).
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks if a node is marked as internal via `internal: true` or `x-internal: true`.
 */
function isInternalNode(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return value.internal === true || value["x-internal"] === true;
}

/**
 * Removes internal markers from a node so they don't appear in final output.
 */
function stripInternalMarkers(value: Record<string, unknown>): void {
	delete value.internal;
	delete value["x-internal"];
}

/**
 * Recursively sanitizes a node by removing internal fields and markers.
 */
function sanitizeNode(node: unknown): void {
	// Handle arrays - filter out internal items
	if (Array.isArray(node)) {
		for (let i = node.length - 1; i >= 0; i--) {
			if (isInternalNode(node[i])) {
				node.splice(i, 1);
				continue;
			}
			sanitizeNode(node[i]);
		}
		return;
	}

	if (!isRecord(node)) return;

	// Handle object properties - remove internal fields
	if (isRecord(node.properties)) {
		const properties = node.properties as Record<string, unknown>;
		const requiredSet = Array.isArray(node.required)
			? new Set(
					node.required.filter(
						(requiredKey): requiredKey is string =>
							typeof requiredKey === "string",
					),
				)
			: null;

		for (const [propertyName, propertySchema] of Object.entries(properties)) {
			// Remove fields marked with x-internal or internal
			if (isInternalNode(propertySchema)) {
				delete properties[propertyName];
				requiredSet?.delete(propertyName);
			}
		}

		if (requiredSet) {
			node.required = [...requiredSet];
		}
	}

	// Handle parameters array - filter out internal parameters
	if (Array.isArray(node.parameters)) {
		node.parameters = node.parameters.filter(
			(parameter) => !isInternalNode(parameter),
		);
	}

	stripInternalMarkers(node);

	// Recurse into all values
	for (const value of Object.values(node)) {
		sanitizeNode(value);
	}
}

/**
 * Removes internal fields from the OpenAPI document.
 * Fields are considered internal if they have `internal: true` or `x-internal: true` in their schema.
 * Mark fields as internal in Zod schemas using `.meta({ internal: true })`.
 *
 * Also removes internal markers from all nodes and filters internal parameters.
 */
export function removeInternalFields({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}): void {
	sanitizeNode(openApiDocument);
}
