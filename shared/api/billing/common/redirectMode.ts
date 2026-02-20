import { z } from "zod/v4";

export const RedirectModeSchema = z
	.enum(["always", "if_required", "never"])
	.meta({
		description:
			"Controls when to return a checkout URL. 'always' returns a URL even if payment succeeds, 'if_required' only when payment action is needed, 'never' disables redirects.",
	});
export type RedirectMode = z.infer<typeof RedirectModeSchema>;
