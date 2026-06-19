import { z } from "zod/v4";

export const CustomButtonFormSchema = z.object({
	label: z.string().trim().min(1, "Label is required"),
	url: z.string().trim().min(1, "URL is required"),
	open_in_new_tab: z.boolean(),
});

export type CustomButtonForm = z.infer<typeof CustomButtonFormSchema>;
