import { z } from "zod/v4";

/** Passes the value through untouched, typed as what Autumn sends, once its shape holds. */
export const sentAs = <Sent>(shape: z.ZodType) =>
	z.custom<Sent>((value) => shape.safeParse(value).success);
