import { z } from "zod/v4";
import { SubscriptionMismatchSchema } from "../verify/verifyParamsV1";

/** Verify's findings for the synced Stripe subscription, as they would stand
 * once the given sync params were applied. */
export const PreviewSyncV2ResponseSchema = z.object({
	mismatches: z.array(SubscriptionMismatchSchema),
});

export type PreviewSyncV2Response = z.infer<typeof PreviewSyncV2ResponseSchema>;
