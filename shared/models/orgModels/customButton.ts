import { z } from "zod/v4";

export const CustomButtonSchema = z.object({
	id: z.string(),
	label: z.string(),
	url: z.string(),
	icon: z.string().optional(),
	open_in_new_tab: z.boolean().default(true),
});

export type CustomButton = z.infer<typeof CustomButtonSchema>;
