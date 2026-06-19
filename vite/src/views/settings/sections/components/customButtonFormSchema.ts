import { z } from "zod/v4";
import {
	isSafeCustomButtonUrl,
	resolveCustomButtonUrl,
} from "@/utils/linkUtils";

export const CustomButtonFormSchema = z.object({
	label: z.string().trim().min(1, "Label is required"),
	url: z
		.string()
		.trim()
		.min(1, "URL is required")
		.refine(
			(url) => isSafeCustomButtonUrl(resolveCustomButtonUrl(url, { id: "id" })),
			"Must be a valid http:// or https:// URL",
		),
	open_in_new_tab: z.boolean(),
});

export type CustomButtonForm = z.infer<typeof CustomButtonFormSchema>;
