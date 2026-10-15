import type { AddLine, InvoiceLineEdits, RemoveLine } from "@autumn/shared";

export const paramsToInvoiceLineEdits = ({
	params,
}: {
	params: {
		entity_id?: string;
		add_lines?: AddLine[];
		remove_lines?: RemoveLine[];
	};
}): InvoiceLineEdits | undefined => {
	if (!params.add_lines?.length && !params.remove_lines?.length) {
		return undefined;
	}

	return {
		removeLines: params.remove_lines ?? [],
		addLines: params.add_lines ?? [],
		requestEntityId: params.entity_id,
	};
};
