import type {
	ParsedOperation,
	ParsedWebhook,
	SchemaField,
} from "./parseOpenApi.js";

export function generateFields({
	operation,
}: {
	operation: ParsedOperation;
}): string {
	const sections: string[] = [];

	if (operation.requestBody && operation.requestBody.length > 0) {
		sections.push("### Body Parameters\n");
		sections.push(
			generateParamFields({ fields: operation.requestBody, indent: 0 }),
		);
	}

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

function generateResponseExampleMarkdown({
	json,
	statusCode,
}: {
	json: unknown;
	statusCode: string;
}): string {
	const jsonString = JSON.stringify(json, null, 2);

	return `
<ResponseExample>
\`\`\`json ${statusCode}
${jsonString}
\`\`\`
</ResponseExample>
`;
}

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

function formatType(type: string, enumValues?: string[]): string {
	if (enumValues && enumValues.length > 0) {
		const isArray = type.endsWith("[]");
		const values = enumValues.map((v) => `'${v}'`).join(" | ");
		return isArray ? `(${values})[]` : values;
	}
	return type;
}

export function generateWebhookFields({
	webhook,
}: {
	webhook: ParsedWebhook;
}): string {
	const sections: string[] = [];

	if (webhook.dataFields && webhook.dataFields.length > 0) {
		sections.push("### Payload Fields\n");
		sections.push(
			generateStaticParamFields({ fields: webhook.dataFields, indent: 0 }),
		);
	}

	return sections.join("\n");
}

function generateStaticParamFields({
	fields,
	indent,
}: {
	fields: SchemaField[];
	indent: number;
}): string {
	const indentStr = "  ".repeat(indent);
	const lines: string[] = [];

	for (const field of fields) {
		const typeStr = formatType(field.type, field.enumValues);
		const requiredAttr = field.required ? " required" : "";
		const description = escapeDescription(field.description);
		const hasChildren = field.children && field.children.length > 0;

		if (hasChildren) {
			lines.push(
				`${indentStr}<ParamField body="${field.name}" type="${typeStr}"${requiredAttr}>`,
			);
			if (description) {
				lines.push(`${indentStr}  ${description}`);
			}
			lines.push(`${indentStr}  <Expandable title="properties">`);
			lines.push(
				generateStaticParamFields({
					fields: field.children!,
					indent: indent + 2,
				}),
			);
			lines.push(`${indentStr}  </Expandable>`);
			lines.push(`${indentStr}</ParamField>\n`);
		} else if (description) {
			lines.push(
				`${indentStr}<ParamField body="${field.name}" type="${typeStr}"${requiredAttr}>`,
			);
			lines.push(`${indentStr}  ${description}`);
			lines.push(`${indentStr}</ParamField>\n`);
		} else {
			lines.push(
				`${indentStr}<ParamField body="${field.name}" type="${typeStr}"${requiredAttr} />\n`,
			);
		}
	}

	return lines.join("\n");
}

function escapeDescription(description?: string): string {
	if (!description) return "";

	return description
		.replace(/\{/g, "\\{")
		.replace(/\}/g, "\\}")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
