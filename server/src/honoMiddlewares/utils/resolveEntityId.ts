import { getV1PathSegmentAfter } from "./resolvePathSegment.js";

/**
 * Centralized entity ID resolution from request sources.
 */
export const resolveEntityId = ({
	method,
	path,
	body,
	query,
}: {
	method: string;
	path: string;
	body?: unknown;
	query?: Record<string, string>;
}): string | undefined => {
	const urlEntityId = parseEntityIdFromPath({ path });
	if (urlEntityId) return urlEntityId;

	if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
		const bodyEntityId = parseEntityIdFromBody({
			path,
			body,
		});
		if (bodyEntityId) return bodyEntityId;
	}

	if (query?.entity_id) return query.entity_id;

	return undefined;
};

const parseEntityIdFromBody = ({
	path,
	body,
}: {
	path: string;
	body: unknown;
}) => {
	const isLegacyCreateEntityPath =
		path.startsWith("/v1/customers/") && path.endsWith("/entities");

	if (isLegacyCreateEntityPath) {
		if (Array.isArray(body)) {
			if (body.length !== 1) return undefined;

			const firstEntity = body[0];
			if (!firstEntity || typeof firstEntity !== "object") return undefined;

			const parsedEntity = firstEntity as Record<string, unknown>;
			return typeof parsedEntity.id === "string" ? parsedEntity.id : undefined;
		}

		if (!body || typeof body !== "object") return undefined;

		const parsedBody = body as Record<string, unknown>;
		return typeof parsedBody.id === "string" ? parsedBody.id : undefined;
	}

	if (!body || typeof body !== "object" || Array.isArray(body))
		return undefined;

	const parsedBody = body as Record<string, unknown>;
	return typeof parsedBody.entity_id === "string"
		? parsedBody.entity_id
		: undefined;
};

const parseEntityIdFromPath = ({
	path,
}: {
	path: string;
}): string | undefined => {
	const entityId = getV1PathSegmentAfter({
		path,
		segment: "entities",
	});

	if (entityId === "create" || entityId === "delete") {
		return undefined;
	}

	return entityId;
};
