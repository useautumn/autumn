import { z } from "zod/v4";

/** How far a new invoice advances: left editable, opened silently, or opened and sent. */
export const InvoiceIssueMethodSchema = z.enum(["draft", "finalize", "send"]);

export type InvoiceIssueMethod = z.infer<typeof InvoiceIssueMethodSchema>;
