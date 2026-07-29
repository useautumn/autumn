import { z } from "zod/v4";
import type { util } from "zod/v4/core";

/** Reusable `{ type, length }` duration schema; `length` is null when the type carries none (e.g. one_off, forever). */
export const makeDurationSchema = <const T extends util.EnumLike>(
	typeEnum: T,
) =>
	z.object({
		type: z.enum(typeEnum).meta({
			description: "The unit of time the duration is measured in.",
		}),
		length: z.number().nullable().meta({
			description:
				"The number of `type` periods the duration lasts, or null when the type has no length (e.g. one_off, forever).",
		}),
	});

export type DurationV0 = z.infer<ReturnType<typeof makeDurationSchema>>;
