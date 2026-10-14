import type { AddLine, RemoveLine } from "@autumn/shared";

export function withInvoiceLineEdits<T extends object>({
	body,
	edits,
}: {
	body: T | null;
	edits: { removeLines: RemoveLine[]; addLines: AddLine[] };
}): T | null {
	if (!body) return body;
	if (edits.removeLines.length === 0 && edits.addLines.length === 0) {
		return body;
	}

	return {
		...body,
		...(edits.removeLines.length > 0 && { remove_lines: edits.removeLines }),
		...(edits.addLines.length > 0 && { add_lines: edits.addLines }),
	};
}
