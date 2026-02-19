import { parse, stringify } from "yaml";
import { removeConstraints } from "./utils/remove-constraints";
import { removeFieldProperties } from "./utils/remove-field-properties";
import { removeInternalFields } from "./utils/remove-internal-fields";
import { removeSnippets } from "./utils/remove-snippets";
import { replaceJavascriptWithTypescript } from "./utils/replace-js-with-ts";
import { stripJsDoc } from "./utils/strip-jsdoc";
import { transformEntityEndpoints } from "./utils/transform-entity-endpoints";
import { transformJsSnippets } from "./utils/transform-js-snippets";
import { transformPythonSnippets } from "./utils/transform-python-snippets";
import { transformResponsePattern } from "./utils/transform-response-pattern";

const SCHEMA_FIELD_REMOVALS: Record<string, string[]> = {
	ProductItem: ["feature"],
	Product: ["properties"],
	// CustomerData: ["fingerprint", "metadata", "stripe_id", "disable_default"],
};

const SNIPPET_REMOVALS: Record<string, string[]> = {
	"POST /products/{product_id}": ["TypeScript", "Python"],
	"GET /products": ["Python"],

	// Missing create, update and delete for features
	"GET /features": ["Python"],
	"GET /features/{feature_id}": ["Python"],
	"POST /features": ["TypeScript", "Python"],
	"UPDATE /features/{feature_id}": ["TypeScript", "Python"],
	"DELETE /features/{feature_id}": ["TypeScript", "Python"],

	"POST /usage": ["Python"],
	"POST /customers/{customer_id}/balances": ["Python"],
};

/**
 * Schema constraints to remove
 * Common options: minLength, maxLength, minimum, maximum, pattern, format
 */
const CONSTRAINT_REMOVALS: string[] = ["minLength", "minimum", "maximum"];

/**
 * Remove specific properties from fields in endpoints
 * Format: { 'METHOD /path': { 'fieldName': ['property1', 'property2'] } }
 */
const FIELD_PROPERTY_REMOVALS: Record<string, Record<string, string[]>> = {
	"POST /products": {
		group: ["default"],
	},
	"GET /customers": {
		metadata: ["default"],
	},
};

/**
 * Remove specified fields from schemas in the OpenAPI spec
 */
function removeSchemaFields({
	spec,
	removals,
}: {
	spec: any;
	removals: Record<string, string[]>;
}) {
	if (!spec.components?.schemas) {
		return;
	}

	for (const [schemaName, fieldsToRemove] of Object.entries(removals)) {
		const schema = spec.components.schemas[schemaName];
		if (!schema?.properties) {
			console.warn(`⚠ Schema "${schemaName}" not found or has no properties`);
			continue;
		}

		for (const field of fieldsToRemove) {
			if (field in schema.properties) {
				delete schema.properties[field];

				// Also remove from required array if present
				if (Array.isArray(schema.required)) {
					schema.required = schema.required.filter((f: string) => f !== field);
					if (schema.required.length === 0) {
						delete schema.required;
					}
				}

				console.log(`  ✓ Removed field "${field}" from schema "${schemaName}"`);
			} else {
				console.warn(
					`  ⚠ Field "${field}" not found in schema "${schemaName}"`,
				);
			}
		}
	}
}

interface Transformation {
	name: string;
	fn: (args: { spec: Record<string, unknown> }) => Record<string, unknown>;
}

async function pull() {
	const response = await fetch(
		"https://app.stainless.com/api/spec/documented/autumn/openapi.documented.yml",
	);
	const data = await response.text();

	// Parse the OpenAPI spec
	const spec = parse(data);
	const version = spec.info?.version || "unknown";

	// Define the transformation pipeline
	const transformations: Transformation[] = [
		{ name: "Stripping JSDoc from descriptions", fn: stripJsDoc },
		{
			name: "Removing fields from schemas",
			fn: ({ spec }) => {
				removeSchemaFields({ spec, removals: SCHEMA_FIELD_REMOVALS });
				return spec;
			},
		},
		{
			name: "Removing schema constraints",
			fn: ({ spec }) => {
				removeConstraints({ spec, constraints: CONSTRAINT_REMOVALS });
				return spec;
			},
		},
		{
			name: "Removing field properties",
			fn: ({ spec }) => {
				removeFieldProperties({ spec, removals: FIELD_PROPERTY_REMOVALS });
				return spec;
			},
		},
		{ name: "Removing internal fields", fn: removeInternalFields },
		{
			name: "Replacing Javascript with Typescript",
			fn: replaceJavascriptWithTypescript,
		},
		{ name: "Transforming JavaScript snippets", fn: transformJsSnippets },
		{ name: "Transforming response pattern", fn: transformResponsePattern },
		{ name: "Transforming entity endpoints", fn: transformEntityEndpoints },
		{ name: "Transforming Python snippets", fn: transformPythonSnippets },
		{
			name: "Removing code snippets from endpoints",
			fn: ({ spec }) => removeSnippets({ spec, removals: SNIPPET_REMOVALS }),
		},
	];

	// Run the pipeline
	const finalSpec = transformations.reduce((currentSpec, { name, fn }) => {
		console.log(`${name}...`);
		const result = fn({ spec: currentSpec });
		return result ?? currentSpec; // Handle functions that mutate and return undefined
	}, spec);

	// Write the modified spec
	const filename = `./mintlify/api/openapi-${version}.yml`;
	await Bun.write(filename, stringify(finalSpec));

	console.log(`\n✓ Pulled OpenAPI spec version ${version} to ${filename}`);
}

pull();
