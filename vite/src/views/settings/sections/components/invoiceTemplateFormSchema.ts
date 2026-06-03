import { z } from "zod/v4";

export const InvoiceTemplateFormSchema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	footer: z.string().trim().min(1, "Footer is required"),
});

export type InvoiceTemplateForm = z.infer<typeof InvoiceTemplateFormSchema>;
