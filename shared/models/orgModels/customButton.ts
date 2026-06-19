import { z } from "zod/v4";

export const CustomButtonSchema = z.object({
	id: z.string(),
	label: z.string(),
	/** URL template; `{customerId}` is substituted with the customer's id. */
	url: z.string(),
	/** Phosphor icon name (see customButtonIcons in the dashboard). */
	icon: z.string().optional(),
	open_in_new_tab: z.boolean().default(true),
});

export type CustomButton = z.infer<typeof CustomButtonSchema>;
