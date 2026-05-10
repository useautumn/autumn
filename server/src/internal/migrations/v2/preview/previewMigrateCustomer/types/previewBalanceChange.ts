import { z } from "zod/v4";

const PreviewBalanceSnapshotSchema = z.object({
	granted: z.number(),
	remaining: z.number(),
	usage: z.number(),
});

export const PreviewBalanceChangeSchema = z.object({
	feature_id: z.string(),
	granted: z.number(),
	remaining: z.number(),
	usage: z.number(),
	before: PreviewBalanceSnapshotSchema,
});

export type PreviewBalanceChange = z.infer<typeof PreviewBalanceChangeSchema>;
