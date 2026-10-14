function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isInternalNode(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return value.internal === true || value["x-internal"] === true;
}

function stripInternalMarkers(value: Record<string, unknown>): void {
	delete value.internal;
	delete value["x-internal"];
}

const HTTP_METHODS = new Set([
	"get",
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
]);

function deleteInternalEntries(record: Record<string, unknown>): Set<string> {
	const removed = new Set<string>();
	for (const [key, value] of Object.entries(record)) {
		if (!isInternalNode(value)) continue;
		delete record[key];
		removed.add(key);
	}
	return removed;
}

function sanitizeNode(node: unknown): void {
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

	if (isRecord(node.properties)) {
		const removed = deleteInternalEntries(node.properties);
		if (Array.isArray(node.required)) {
			node.required = node.required.filter((key) => !removed.has(key));
		}
	}

	if (isRecord(node.paths)) {
		for (const [path, pathItem] of Object.entries(node.paths)) {
			if (!isRecord(pathItem)) continue;
			deleteInternalEntries(pathItem);
			if (!Object.keys(pathItem).some((key) => HTTP_METHODS.has(key))) {
				delete node.paths[path];
			}
		}
	}

	if (Array.isArray(node.parameters)) {
		node.parameters = node.parameters.filter(
			(parameter) => !isInternalNode(parameter),
		);
	}

	for (const value of Object.values(node)) {
		sanitizeNode(value);
	}

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
	sanitizeNode(openApiDocument);
	stripMarkersEverywhere(openApiDocument);
}
