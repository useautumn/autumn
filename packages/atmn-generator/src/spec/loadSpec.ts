import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import type { JsonSchema } from "../casing/schemaKeyCasing";

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

/** The item schema for one top-level collection, e.g. `features` or `plans`. */
export const collectionItemSchema = ({
	spec,
	collection,
}: {
	spec: OpenApiDocument;
	collection: string;
}): JsonSchema => {
	const item = catalogUpdateSchema({ spec }).properties?.[collection]?.items;
	if (!item) {
		throw new Error(
			`\`${collection}\` is not an array on the catalogV2.update body. Available: ${Object.keys(
				catalogUpdateSchema({ spec }).properties ?? {},
			).join(", ")}`,
		);
	}
	return item;
};
