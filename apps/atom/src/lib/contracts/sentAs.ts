import { z } from "zod/v4";

export const sentAs = <Sent>(shape: z.ZodType) =>
	z.custom<Sent>((value) => shape.safeParse(value).success);
