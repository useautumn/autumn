import { buildWhenSchema, type WhenOf } from "./buildWhenSchema";
import { sharedWhenFields } from "./whenFields";

/** Update or delete a customer. */
export const customerWhenShape = { customer: sharedWhenFields.customer };

export const CustomerWhenSchema = buildWhenSchema({ shape: customerWhenShape });
export type CustomerWhen = WhenOf<typeof customerWhenShape>;
