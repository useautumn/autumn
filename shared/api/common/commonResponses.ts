import { z } from "zod/v4";

// Base schema without .meta() to avoid side effects during imports
export const SuccessResponseSchema = z.object({
	success: z.boolean(),
});

export const getListResponseSchema = ({
	schema,
	id,
	description,
}: {
	schema: z.ZodType;
	id?: string;
	description?: string;
}) => {
	const listResponse = z.object({
		list: z.array(schema),
	});

	if (id || description) {
		listResponse.meta({
			id,
			description,
		});
	}

	return listResponse;
};
