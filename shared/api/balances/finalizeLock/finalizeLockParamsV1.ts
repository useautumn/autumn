import { z } from "zod/v4";
import {
	finalizeLockParamsFields,
	releaseTakesNoOverrideValue,
	releaseTakesNoOverrideValueError,
} from "./finalizeLockParamsV0.js";

/** From 2.6 a finalize names its lock's customer; only that customer's lock can be settled. */
export const FinalizeLockParamsV1Schema = finalizeLockParamsFields
	.extend({
		customer_id: z.string().min(1).meta({
			description:
				"The customer the lock belongs to. A lock of any other customer is not found.",
		}),
	})
	.refine(releaseTakesNoOverrideValue, releaseTakesNoOverrideValueError);

export type FinalizeLockParamsV1 = z.infer<typeof FinalizeLockParamsV1Schema>;
