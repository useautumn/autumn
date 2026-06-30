import { z } from "zod/v4";
import type { util } from "zod/v4/core";

const DEFAULT_LENGTH_DESCRIPTION =
	"The number of `type` periods the duration lasts, or null when the type has no length (e.g. one_off, forever).";

/**
 * Reusable `{ type, length }` duration schema. `lengthDescription` is overridable
 * because the valid `type` values (and thus whether `length` is ever null) differ
 * per caller — e.g. coupon durations include one_off/forever; grant expiries don't.
 */
export const makeDurationSchema = <const T extends util.EnumLike>(
	typeEnum: T,
	lengthDescription: string = DEFAULT_LENGTH_DESCRIPTION,
) =>
	z.object({
		type: z.enum(typeEnum).meta({
			description: "The unit of time the duration is measured in.",
		}),
		length: z.number().nullable().meta({
			description: lengthDescription,
		}),
	});

export type DurationV0 = z.infer<ReturnType<typeof makeDurationSchema>>;
