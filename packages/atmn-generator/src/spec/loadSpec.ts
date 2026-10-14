import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "yaml";
import { type JsonSchema, toCamelCase } from "../casing/schemaKeyCasing";

export const INTERNAL_SPEC_PATH = join(
	import.meta.dir,
	"../../../openapi/openapi-internal.yml",
);

export const PUBLIC_SPEC_PATH = join(
	import.meta.dir,
	"../../../openapi/openapi.yml",
);

const CATALOG_UPDATE_PATH = "/v1/catalogV2.update";

export type OpenApiDocument = {
	paths: Record<string, Record<string, OpenApiOperation>>;
};

type OpenApiOperation = {
	operationId?: string;
	description?: string;
	parameters?: { name?: string; in?: string; schema?: JsonSchema }[];
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
} = {}): OpenApiDocument =>
	yaml.parse(readFileSync(path, "utf8"), { maxAliasCount: -1 });

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

export const serverBaseUrl = ({ spec }: { spec: OpenApiDocument }): string => {
	const url = (spec as { servers?: { url?: string }[] }).servers?.[0]?.url;
	if (!url) throw new Error("spec declares no servers[0].url");
	return url;
};
