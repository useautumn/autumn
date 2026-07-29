import { asRecord, type LooseRecord } from "../records.js";

const parseJson = (text: string): unknown => {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
};

// Unwraps MCP transport shapes around a preview payload: JSON strings,
// [{text}] content arrays, {content} results, and the {preview, pending} wrapper.
export const parsePreviewPayload = (preview: unknown): LooseRecord | null => {
	if (typeof preview === "string") {
		const parsed = parseJson(preview.trim());
		return parsed ? parsePreviewPayload(parsed) : null;
	}
	if (Array.isArray(preview)) {
		for (const entry of preview) {
			const record = asRecord(entry);
			if (typeof record?.text !== "string") continue;
			const parsed = parsePreviewPayload(record.text);
			if (parsed) return parsed;
		}
		return null;
	}
	const record = asRecord(preview);
	if (!record) return null;
	if (Array.isArray(record.content)) return parsePreviewPayload(record.content);
	if ("preview" in record) return parsePreviewPayload(record.preview);
	return record;
};
