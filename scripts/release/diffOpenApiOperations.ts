const HTTP_METHODS = ["get", "put", "post", "delete", "patch"] as const;

type OpenApiDocument = {
	paths?: Record<string, Record<string, unknown>>;
	components?: Record<string, Record<string, unknown>>;
};

export type OpenApiOperation = {
	key: string;
	operationId: string | null;
	tag: string;
	fingerprint: string;
};

export type OperationDiff = {
	added: OpenApiOperation[];
	removed: OpenApiOperation[];
	changed: OpenApiOperation[];
};

const resolveRef = ({
	document,
	ref,
}: {
	document: OpenApiDocument;
	ref: string;
}): unknown => {
	const [, section, name] = ref.match(/^#\/components\/([^/]+)\/(.+)$/) ?? [];
	if (!section || !name) return { $ref: ref };
	return document.components?.[section]?.[name] ?? { $ref: ref };
};

/** Inlines component refs so a schema change shows up on every operation using it. */
const inlineRefs = ({
	document,
	value,
	seen,
}: {
	document: OpenApiDocument;
	value: unknown;
	seen: Set<string>;
}): unknown => {
	if (Array.isArray(value)) {
		return value.map((item) => inlineRefs({ document, value: item, seen }));
	}
	if (!value || typeof value !== "object") return value;

	const record = value as Record<string, unknown>;
	if (typeof record.$ref === "string") {
		if (seen.has(record.$ref)) return { $ref: record.$ref };
		return inlineRefs({
			document,
			value: resolveRef({ document, ref: record.$ref }),
			seen: new Set([...seen, record.$ref]),
		});
	}
	return Object.fromEntries(
		Object.keys(record)
			.sort()
			.map((key) => [key, inlineRefs({ document, value: record[key], seen })]),
	);
};

export const listOpenApiOperations = ({
	document,
}: {
	document: OpenApiDocument;
}): OpenApiOperation[] =>
	Object.entries(document.paths ?? {}).flatMap(([path, pathItem]) =>
		HTTP_METHODS.flatMap((method) => {
			const operation = pathItem[method] as
				| { operationId?: string; tags?: string[] }
				| undefined;
			if (!operation) return [];
			const resolved = inlineRefs({
				document,
				value: operation,
				seen: new Set(),
			});
			return [
				{
					key: `${method.toUpperCase()} ${path}`,
					operationId: operation.operationId ?? null,
					tag: operation.tags?.[0] ?? "core",
					fingerprint: Bun.hash(JSON.stringify(resolved)).toString(16),
				},
			];
		}),
	);

export const diffOpenApiOperations = ({
	base,
	head,
}: {
	base: OpenApiDocument;
	head: OpenApiDocument;
}): OperationDiff => {
	const baseOps = new Map(
		listOpenApiOperations({ document: base }).map((op) => [op.key, op]),
	);
	const headOps = new Map(
		listOpenApiOperations({ document: head }).map((op) => [op.key, op]),
	);
	return {
		added: [...headOps.values()].filter((op) => !baseOps.has(op.key)),
		removed: [...baseOps.values()].filter((op) => !headOps.has(op.key)),
		changed: [...headOps.values()].filter((op) => {
			const previous = baseOps.get(op.key);
			return previous !== undefined && previous.fingerprint !== op.fingerprint;
		}),
	};
};
