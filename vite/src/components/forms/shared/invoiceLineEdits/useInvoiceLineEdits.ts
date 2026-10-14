import type { AddLine, RemoveLine } from "@autumn/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BillingLineItem } from "@/components/v2/LineItemsPreview";
import { withInvoiceLineEdits } from "./withInvoiceLineEdits";

export type RemovedInvoiceLine = {
	removeLine: RemoveLine;
	lineItem: BillingLineItem;
};

/** Remove/add edits to the invoice a billing request creates, kept outside the form. */
export function useInvoiceLineEdits({
	resetKey,
	enabled = true,
}: {
	/** Removals reset when the request they were picked from changes. */
	resetKey: string;
	enabled?: boolean;
}) {
	const [removed, setRemoved] = useState<RemovedInvoiceLine[]>([]);
	const [added, setAdded] = useState<AddLine[]>([]);
	const lastResetKey = useRef(resetKey);

	useEffect(() => {
		if (lastResetKey.current === resetKey) return;
		lastResetKey.current = resetKey;
		setRemoved([]);
	}, [resetKey]);

	const removeLine = useCallback((lineItem: BillingLineItem) => {
		const selector = lineItem.remove_line;
		if (!selector) return;
		setRemoved((current) => [...current, { removeLine: selector, lineItem }]);
	}, []);

	const undoRemove = useCallback((index: number) => {
		setRemoved((current) => current.filter((_, i) => i !== index));
	}, []);

	const addLine = useCallback((line: AddLine) => {
		setAdded((current) => [...current, line]);
	}, []);

	const removeAddedLine = useCallback((index: number) => {
		setAdded((current) => current.filter((_, i) => i !== index));
	}, []);

	const clear = useCallback(() => {
		setRemoved([]);
		setAdded([]);
	}, []);

	const edits = useMemo(
		() => ({
			removeLines: enabled ? removed.map(({ removeLine }) => removeLine) : [],
			addLines: enabled ? added : [],
		}),
		[enabled, removed, added],
	);

	const applyToBody = useCallback(
		<T extends object>(body: T | null) => withInvoiceLineEdits({ body, edits }),
		[edits],
	);

	return {
		enabled,
		removed,
		added,
		hasEdits: removed.length > 0 || added.length > 0,
		removeLine,
		undoRemove,
		addLine,
		removeAddedLine,
		clear,
		applyToBody,
	};
}

export type InvoiceLineEditsController = ReturnType<typeof useInvoiceLineEdits>;
