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

/** Deletes every entry whose value is an internal node; returns the deleted keys. */
function deleteInternalEntries(record: Record<string, unknown>): Set<string> {
	const removed = new Set<string>();
	for (const [key, value] of Object.entries(record)) {
		if (!isInternalNode(value)) continue;
		delete record[key];
		removed.add(key);
	}
	return removed;
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
		const removed = deleteInternalEntries(node.properties);
		if (Array.isArray(node.required)) {
			node.required = node.required.filter((key) => !removed.has(key));
		}
	}

	// Handle paths - remove internal operations, then empty path items
	if (isRecord(node.paths)) {
		for (const [path, pathItem] of Object.entries(node.paths)) {
			if (!isRecord(pathItem)) continue;
			deleteInternalEntries(pathItem);
			if (Object.keys(pathItem).length === 0) delete node.paths[path];
		}
	}

	// Handle parameters array - filter out internal parameters
	if (Array.isArray(node.parameters)) {
		node.parameters = node.parameters.filter(
			(parameter) => !isInternalNode(parameter),
		);
	}

	// Recurse into all values
	for (const value of Object.values(node)) {
		sanitizeNode(value);
	}

	// Filtering internal union branches (during the recursion above) can leave
	// a single-member anyOf; inline it so the public spec shows a plain schema.
	if (Array.isArray(node.anyOf) && node.anyOf.length === 1) {
		const [only] = node.anyOf;
		if (isRecord(only)) {
			delete node.anyOf;
			for (const [key, value] of Object.entries(only)) {
				if (!(key in node)) {
					node[key] = value;
				}
			}
		}
	}
}

/**
 * Removes internal fields from the OpenAPI document.
 * Fields are considered internal if they have `internal: true` or `x-internal: true` in their schema.
 * Mark fields as internal in Zod schemas using `.meta({ internal: true })`.
 *
 * Also removes internal markers from all nodes and filters internal parameters.
 */
function stripMarkersEverywhere(node: unknown): void {
	if (Array.isArray(node)) {
		for (const item of node) stripMarkersEverywhere(item);
		return;
	}
	if (!isRecord(node)) return;
	stripInternalMarkers(node);
	for (const value of Object.values(node)) stripMarkersEverywhere(value);
}

export function removeInternalFields({
	openApiDocument,
}: {
	openApiDocument: Record<string, unknown>;
}): void {
	// Two passes on purpose. zod-openapi emits shared schema objects (the spec is
	// full of YAML anchors), so stripping a marker while deleting would leave a
	// second parent holding the same object with nothing left to match on.
	sanitizeNode(openApiDocument);
	stripMarkersEverywhere(openApiDocument);
}
