import { type JsonSchema, toCamelCase } from "../casing/schemaKeyCasing";
import {
	fixtureNameFor,
	isHidden,
	isInternalField,
	type Overlay,
} from "../overlay/overlay";
import { resolveRef } from "../spec/resolveRef";
import type {
	MappingIdentity,
	MappingProjection,
} from "./runtime/mappingAssignments";

export const mappingProjection = ({
	schema,
	root,
	overlay,
	collection,
}: {
	schema: JsonSchema;
	root: JsonSchema;
	overlay: Overlay;
	collection: string;
}): MappingProjection | undefined => {
	const fixturePath = (path: string): string => {
		let wirePath = "";
		return path
			.split(".")
			.map((key) => {
				wirePath = wirePath ? `${wirePath}.${key}` : key;
				return fixtureNameFor({
					overlay,
					collection,
					path: wirePath,
					recased: toCamelCase(key),
				});
			})
			.join(".");
	};
	const visit = ({
		node,
		path,
		seen,
	}: {
		node: JsonSchema;
		path: string;
		seen: Set<JsonSchema>;
	}): MappingProjection | undefined => {
		const resolved = resolveRef({ schema: node, root }) ?? node;
		if (seen.has(resolved)) return undefined;
		const next = new Set(seen).add(resolved);
		const sourcePath =
			node["x-atmn-source-path"] ?? resolved["x-atmn-source-path"];
		const source =
			typeof sourcePath === "string"
				? { sourcePath: sourcePath.split(".").map(toCamelCase) }
				: {};
		if (node["x-atmn-mapping"] === true || resolved["x-atmn-mapping"] === true)
			return { mapping: true, ...source };
		if (resolved.items) {
			const items = visit({ node: resolved.items, path, seen: next });
			if (!items) return undefined;
			const itemSchema =
				resolveRef({ schema: resolved.items, root }) ?? resolved.items;
			const identity = itemSchema["x-atmn-identity"] as
				| MappingIdentity
				| undefined;
			if (!identity?.responseField || !Array.isArray(identity.components))
				throw new Error(
					`Mapping array ${collection}.${path} must declare x-atmn-identity`,
				);
			return {
				items,
				identity: {
					...identity,
					responseField: identity.responseField
						.split(".")
						.map(toCamelCase)
						.join("."),
					components: identity.components.map(
						(component: MappingIdentity["components"][number]) => ({
							...component,
							paths: component.paths.map((componentPath) => {
								const prefix = path ? `${path}.` : "";
								return fixturePath(`${prefix}${componentPath}`)
									.split(".")
									.slice(path ? path.split(".").length : 0)
									.join(".");
							}),
						}),
					),
				},
				...source,
			};
		}
		let result: MappingProjection = { ...source };
		const properties: Record<string, MappingProjection> = {};
		for (const branch of [
			...(resolved.allOf ?? []),
			...(resolved.anyOf ?? []),
			...(resolved.oneOf ?? []),
		]) {
			const projected = visit({ node: branch, path, seen: next });
			if (!projected) continue;
			result = { ...result, ...projected };
			Object.assign(properties, projected.properties);
		}
		for (const [key, child] of Object.entries(resolved.properties ?? {})) {
			const childPath = path ? `${path}.${key}` : key;
			if (
				isHidden({ overlay, collection, path: childPath }) ||
				isInternalField({ overlay, wireKey: key, schema: child })
			)
				continue;
			const projected = visit({ node: child, path: childPath, seen: next });
			if (!projected) continue;
			const remoteKey = toCamelCase(key);
			const fixtureKey = fixtureNameFor({
				overlay,
				collection,
				path: childPath,
				recased: remoteKey,
			});
			properties[fixtureKey] = {
				...(fixtureKey !== remoteKey ? { sourcePath: [remoteKey] } : {}),
				...projected,
			};
		}
		if (Object.keys(properties).length) return { ...result, properties };
		return result.mapping || result.items ? result : undefined;
	};
	return visit({ node: schema, path: "", seen: new Set() });
};
