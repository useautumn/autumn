import { z } from "zod/v4";

/** No balance moves when a lock is confirmed at what it took, so there is nothing to report but that it closed. */
export const confirmExpiredLockResultSchema = z
	.object({
		type: z.literal("confirmExpiredLock"),
		status: z.literal("expired"),
	})
	.loose();

export type ConfirmExpiredLockResult = z.infer<
	typeof confirmExpiredLockResultSchema
>;
