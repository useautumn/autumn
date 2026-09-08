import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { type JsonSchema, toCamelCase } from "../casing/schemaKeyCasing";

/**
 * The INTERNAL spec, not the published one. catalogV2 is registered only on the
 * internal contract router, and this is the one output that skips
 * `removeInternalFields`, so `internal_id` and friends survive.
 */
export const INTERNAL_SPEC_PATH = join(
	import.meta.dir,
	"../../../openapi/openapi-internal.yml",
);

const CATALOG_UPDATE_PATH = "/v1/catalogV2.update";

export type OpenApiDocument = {
	paths: Record<string, Record<string, OpenApiOperation>>;
};

type OpenApiOperation = {
	operationId?: string;
	requestBody?: { content: Record<string, { schema: JsonSchema }> };
	responses?: Record<
		string,
		{ content?: Record<string, { schema: JsonSchema }> }
	>;
};

export const loadSpec = ({
	path = INTERNAL_SPEC_PATH,
}: {
	path?: string;
} = {}): OpenApiDocument => yaml.parse(readFileSync(path, "utf8"));

const operationAt = ({
	spec,
	path,
}: {
	spec: OpenApiDocument;
	path: string;
}): OpenApiOperation => {
	const operation = spec.paths?.[path]?.post;
	if (!operation) {
		throw new Error(
			`${path} is missing from the spec. It is registered on v2_3InternalContractRouter — has \`bun api\` been run since?`,
		);
	}
	return operation;
};

/** The wire envelope: every top-level catalog collection the CLI can state. */
export const catalogUpdateSchema = ({
	spec,
}: {
	spec: OpenApiDocument;
}): JsonSchema => {
	const schema = operationAt({ spec, path: CATALOG_UPDATE_PATH }).requestBody
		?.content["application/json"]?.schema;
	if (!schema)
		throw new Error(`${CATALOG_UPDATE_PATH} has no JSON request body`);
	return schema;
};

/** The item schema for one top-level collection, named as a fixture states it. */
export const collectionItemSchema = ({
	spec,
	collection,
}: {
	spec: OpenApiDocument;
	collection: string;
}): JsonSchema => {
	const properties = catalogUpdateSchema({ spec }).properties ?? {};
	const entry = Object.entries(properties).find(
		([wireKey]) => toCamelCase(wireKey) === collection,
	);
	const item = entry?.[1]?.items;
	if (!item) {
		throw new Error(
			`\`${collection}\` is not an array on the catalogV2.update body. Available: ${Object.keys(
				properties,
			).join(", ")}`,
		);
	}
	return item;
};

/** The JSON request body schema for an operation. */
export const requestBodySchema = ({
	spec,
	path,
}: {
	spec: OpenApiDocument;
	path: string;
}): JsonSchema => {
	const schema = operationAt({ spec, path }).requestBody?.content[
		"application/json"
	]?.schema;
	if (!schema) throw new Error(`${path} has no JSON request body`);
	return schema;
};

/** The 200 response body schema for an operation. */
export const responseSchema = ({
	spec,
	path,
}: {
	spec: OpenApiDocument;
	path: string;
}): JsonSchema => {
	const schema = operationAt({ spec, path }).responses?.["200"]?.content?.[
		"application/json"
	]?.schema;
	if (!schema) throw new Error(`${path} has no 200 JSON response`);
	return schema;
};

/** Where the API lives, per the spec — not a constant the CLI invents. */
export const serverBaseUrl = ({ spec }: { spec: OpenApiDocument }): string => {
	const url = (spec as { servers?: { url?: string }[] }).servers?.[0]?.url;
	if (!url) throw new Error("spec declares no servers[0].url");
	return url;
};
