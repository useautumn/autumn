import { z } from "zod/v4";
import {
	isSafeCustomButtonUrl,
	resolveCustomButtonUrl,
} from "@/utils/linkUtils";

export const CustomButtonFormSchema = z.object({
	label: z.string().trim().min(1, "Label is required"),
	icon: z.string().min(1, "Icon is required"),
	url: z
		.string()
		.trim()
		.min(1, "URL is required")
		.refine(
			(url) =>
				isSafeCustomButtonUrl(
					resolveCustomButtonUrl(url, { id: "id", email: "email" }),
				),
			"Must be a valid http, https, mailto, or tel URL",
		),
	open_in_new_tab: z.boolean(),
});

export type CustomButtonForm = z.infer<typeof CustomButtonFormSchema>;
