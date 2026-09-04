import type { CreditSchemaItem } from "@autumn/shared";
import { hasCreditDimensionRules } from "@autumn/shared";
import { useState } from "react";
import { withoutDimensions } from "../utils/creditDimensionUtils";

/** One switch for the whole rate card: on opens the section, off strips every row's rules. */
export function useCreditDimensionsToggle({
	schema,
	setSchema,
}: {
	schema: CreditSchemaItem[];
	setSchema: (schema: CreditSchemaItem[]) => void;
}) {
	const [open, setOpen] = useState(() => schema.some(hasCreditDimensionRules));
	const enabled = open || schema.some(hasCreditDimensionRules);

	return {
		enabled,
		setEnabled: (next: boolean) => {
			setOpen(next);
			if (!next) setSchema(schema.map(withoutDimensions));
		},
	};
}
