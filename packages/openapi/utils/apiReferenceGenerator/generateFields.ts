import type { ParsedOperation, SchemaField } from "./parseOpenApi.js";

/**
 * Generate the MDX content for request body and response fields.
 */
export function generateFields({
	operation,
}: {
	operation: ParsedOperation;
}): string {
	const sections: string[] = [];

	// Generate request body parameters
	if (operation.requestBody && operation.requestBody.length > 0) {
		sections.push("### Body Parameters\n");
		sections.push(
			generateParamFields({ fields: operation.requestBody, indent: 0 }),
		);
	}

	// Generate response fields (use 200 or 201 response)
	const responseStatusCode = operation.responses?.["200"]
		? "200"
		: operation.responses?.["201"]
			? "201"
			: null;
	const responseFields = responseStatusCode
		? operation.responses?.[responseStatusCode]
		: null;

	if (responseFields && responseFields.length > 0) {
		sections.push("\n### Response\n");
		sections.push(
			generateResponseFields({ fields: responseFields, indent: 0 }),
		);
	}

	// Generate DynamicResponseExample with the actual example from OpenAPI spec
	// This example is already in snake_case - the component will convert to camelCase when needed
	const responseExample = responseStatusCode
		? operation.responseExamples?.[responseStatusCode]
		: null;

	if (responseExample && typeof responseExample === "object") {
		sections.push(
			generateResponseExampleMarkdown({
				json: responseExample,
				statusCode: responseStatusCode!,
			}),
		);
	}

	return sections.join("\n");
}

/**
 * Generate a ResponseExample with markdown code block.
 * Uses Mintlify's ResponseExample component which pins content to the sidebar.
 */
function generateResponseExampleMarkdown({
	json,
	statusCode,
}: {
	json: unknown;
	statusCode: string;
}): string {
	// Format the JSON with proper indentation
	const jsonString = JSON.stringify(json, null, 2);

	// Generate markdown ResponseExample block
	// The triple backticks create a code block inside ResponseExample
	return `
<ResponseExample>
\`\`\`json ${statusCode}
${jsonString}
\`\`\`
</ResponseExample>
`;
}

/**
 * Generate DynamicParamField components for request body fields.
 */
function generateParamFields({
	fields,
	indent,
}: {
	fields: SchemaField[];
	indent: number;
}): string {
	const indentStr = "  ".repeat(indent);
	const lines: string[] = [];

	for (const field of fields) {
		const props = buildFieldProps({
			name: field.name,
			type: field.type,
			required: field.required,
			enumValues: field.enumValues,
		});

		const description = escapeDescription(field.description);
		const hasChildren = field.children && field.children.length > 0;

		if (hasChildren) {
			// Field with nested children
			lines.push(`${indentStr}<DynamicParamField ${props}>`);
			if (description) {
				lines.push(`${indentStr}  ${description}`);
			}
			lines.push(`${indentStr}  <Expandable title="properties">`);
			lines.push(
				generateParamFields({ fields: field.children!, indent: indent + 2 }),
			);
			lines.push(`${indentStr}  </Expandable>`);
			lines.push(`${indentStr}</DynamicParamField>\n`);
		} else {
			// Simple field
			if (description) {
				lines.push(`${indentStr}<DynamicParamField ${props}>`);
				lines.push(`${indentStr}  ${description}`);
				lines.push(`${indentStr}</DynamicParamField>\n`);
			} else {
				lines.push(`${indentStr}<DynamicParamField ${props} />\n`);
			}
		}
	}

	return lines.join("\n");
}

/**
 * Generate DynamicResponseField components for response fields.
 */
function generateResponseFields({
	fields,
	indent,
}: {
	fields: SchemaField[];
	indent: number;
}): string {
	const indentStr = "  ".repeat(indent);
	const lines: string[] = [];

	for (const field of fields) {
		const props = buildResponseFieldProps({
			name: field.name,
			type: field.type,
			enumValues: field.enumValues,
		});

		const description = escapeDescription(field.description);
		const hasChildren = field.children && field.children.length > 0;

		if (hasChildren) {
			// Field with nested children
			lines.push(`${indentStr}<DynamicResponseField ${props}>`);
			if (description) {
				lines.push(`${indentStr}  ${description}`);
			}
			lines.push(`${indentStr}  <Expandable title="properties">`);
			lines.push(
				generateResponseFields({ fields: field.children!, indent: indent + 2 }),
			);
			lines.push(`${indentStr}  </Expandable>`);
			lines.push(`${indentStr}</DynamicResponseField>\n`);
		} else {
			// Simple field
			if (description) {
				lines.push(`${indentStr}<DynamicResponseField ${props}>`);
				lines.push(`${indentStr}  ${description}`);
				lines.push(`${indentStr}</DynamicResponseField>\n`);
			} else {
				lines.push(`${indentStr}<DynamicResponseField ${props} />\n`);
			}
		}
	}

	return lines.join("\n");
}

/**
 * Build the props string for a DynamicParamField component.
 */
function buildFieldProps({
	name,
	type,
	required,
	enumValues,
}: {
	name: string;
	type: string;
	required: boolean;
	enumValues?: string[];
}): string {
	const props: string[] = [
		`body="${name}"`,
		`type="${formatType(type, enumValues)}"`,
	];

	if (required) {
		props.push("required");
	}

	return props.join(" ");
}

/**
 * Build the props string for a DynamicResponseField component.
 */
function buildResponseFieldProps({
	name,
	type,
	enumValues,
}: {
	name: string;
	type: string;
	enumValues?: string[];
}): string {
	return `name="${name}" type="${formatType(type, enumValues)}"`;
}

/**
 * Format the type string, including enum values if present.
 */
function formatType(type: string, enumValues?: string[]): string {
	if (enumValues && enumValues.length > 0) {
		// Show enum values inline if there are few, otherwise just show "enum"
		if (enumValues.length <= 5) {
			return enumValues.map((v) => `'${v}'`).join(" | ");
		}
		return "enum";
	}
	return type;
}

/**
 * Escape special characters in description for MDX.
 */
function escapeDescription(description?: string): string {
	if (!description) return "";

	return (
		description
			// Escape curly braces for JSX
			.replace(/\{/g, "\\{")
			.replace(/\}/g, "\\}")
			// Remove markdown code blocks that might cause issues
			.replace(/```[\s\S]*?```/g, "")
			// Normalize whitespace
			.replace(/\s+/g, " ")
			.trim()
	);
}
