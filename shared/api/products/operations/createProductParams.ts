import { idRegex } from "@utils/utils.js";
import { z } from "zod/v4";

export const CreateProductParamsSchema = z.object({
	id: z.string().nonempty().regex(idRegex),

	name: z.string().refine((val) => val.length > 0, {
		message: "name must be a non-empty string",
	}),

	is_add_on: z.boolean().default(false),
	is_default: z.boolean().default(false),
	version: z.number().optional(),
	group: z.string().default(""),
});
