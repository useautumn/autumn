import { z } from "zod/v4";
import { InvoiceStatus } from "../../../models/cusModels/invoiceModels/invoiceModels.js";
import { ProcessorType } from "../../../models/genModels/genEnums.js";
import {
	CursorRequestFieldSchema,
	createCursorLimitSchema,
	PaginationDefaults,
} from "../../common/cursorPaginationSchemas.js";

export const ListInvoicesParamsSchema = z
	.object({
		start_cursor: CursorRequestFieldSchema,
		limit: createCursorLimitSchema({
			defaultLimit: PaginationDefaults.DefaultLimit,
		}),

		customer_id: z.string().optional().meta({
			description: "Filter invoices to a single customer by ID.",
		}),

		entity_id: z.string().optional().meta({
			description:
				"Filter invoices to a single entity by ID. Must be provided together with customer_id, since entity IDs are only unique per customer.",
		}),

		status: z.array(z.enum(InvoiceStatus)).optional().meta({
			description:
				"Filter by invoice status (draft, open, paid, void, uncollectible).",
		}),

		processor_types: z.array(z.enum(ProcessorType)).optional().meta({
			description:
				"Filter by billing processor (stripe, revenuecat). Invoices recorded before processor tracking count as stripe.",
		}),
	})
	.refine((params) => !params.entity_id || params.customer_id, {
		message: "entity_id filter requires customer_id",
	});

export type ListInvoicesParams = z.infer<typeof ListInvoicesParamsSchema>;
