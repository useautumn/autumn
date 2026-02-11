import { z } from "zod/v4";

export const ListPlansQuerySchema = z.object({
	customer_id: z.string().optional(),
	entity_id: z.string().optional().meta({
		internal: true,
	}),
	include_archived: z.boolean().optional().meta({
		internal: true,
	}),
	v1_schema: z.boolean().optional().meta({
		internal: true,
	}),
});

export type ListPlansQuery = z.infer<typeof ListPlansQuerySchema>;
