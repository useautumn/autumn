import { z } from "zod/v4";

export const SyncProposalsParamsV0Schema = z.object({
	customer_id: z.string(),
});

export type SyncProposalsParamsV0 = z.infer<typeof SyncProposalsParamsV0Schema>;
