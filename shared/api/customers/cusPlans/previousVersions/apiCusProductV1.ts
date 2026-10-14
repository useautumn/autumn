import { z } from "zod/v4";
import { ApiCusProductV0Schema } from "./apiCusProductV0";

export const ApiCusProductV1Schema = ApiCusProductV0Schema.extend({
	current_period_end: z.number().nullish(),
	current_period_start: z.number().nullish(),
});

type ApiCusProductV1 = z.infer<typeof ApiCusProductV1Schema>;
