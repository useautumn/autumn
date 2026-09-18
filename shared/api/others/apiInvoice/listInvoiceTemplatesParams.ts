import { createPaginationParamsSchema } from "@api/common/pagePaginationSchemas.js";
import { InvoiceTemplateSchema } from "@models/invoiceTemplateModels/invoiceTemplate.js";
import { z } from "zod/v4";

export const ListInvoiceTemplatesParamsSchema = createPaginationParamsSchema({
	defaultLimit: 10,
})
	.strict()
	.meta({
		id: "ListInvoiceTemplatesParams",
		description: "Parameters for listing an organization's invoice templates.",
	});

export const ListInvoiceTemplatesResponseSchema = z.object({
	list: z.array(InvoiceTemplateSchema).meta({
		description: "Invoice templates, newest first.",
	}),
	total: z.number().meta({
		description: "Number of templates returned in this page.",
	}),
	limit: z.number(),
	offset: z.number(),
	has_more: z.boolean().meta({
		description: "Whether more templates exist after this page.",
	}),
});

export type ListInvoiceTemplatesParams = z.infer<
	typeof ListInvoiceTemplatesParamsSchema
>;
export type ListInvoiceTemplatesParamsInput = z.input<
	typeof ListInvoiceTemplatesParamsSchema
>;
export type ListInvoiceTemplatesResponse = z.infer<
	typeof ListInvoiceTemplatesResponseSchema
>;
