import { z } from "zod/v4";

export const confirmExpiredLockResultSchema = z
	.object({
		type: z.literal("confirmExpiredLock"),
		status: z.literal("expired"),
	})
	.loose();

export type ConfirmExpiredLockResult = z.infer<
	typeof confirmExpiredLockResultSchema
>;
