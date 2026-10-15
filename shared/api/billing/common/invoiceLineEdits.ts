import { InvoiceCustomLineItemSchema } from "@api/others/apiInvoice/createInvoiceParams.js";
import { z } from "zod/v4";
import { type RemoveLine, RemoveLineSchema } from "./removeLine";

export const AddLineSchema = InvoiceCustomLineItemSchema.meta({
	title: "AddLine",
	description:
		"A line added to this invoice. The amount is billed as passed; the period is only printed on the line.",
});

export const InvoiceLineEditsParamsShape = {
	remove_lines: z.array(RemoveLineSchema).min(1).optional().meta({
		description:
			"Lines to remove from the invoice this request creates. Never changes the subscription or later invoices.",
	}),
	add_lines: z.array(AddLineSchema).min(1).optional().meta({
		description:
			"Lines to add to the invoice this request creates. Never changes the subscription or later invoices.",
	}),
};

export type AddLine = z.infer<typeof AddLineSchema>;

export type InvoiceLineEdits = {
	removeLines: RemoveLine[];
	addLines: AddLine[];
	requestEntityId?: string;
};
