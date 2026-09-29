import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { openLockSchema } from "../../../models/subject/rows/workerLock.js";

/** Closes a lock that confirms on expiry: it keeps what it took, so only the row and its id in memory go. */
export const confirmExpiredLockCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("confirmExpiredLock"),
		lock: openLockSchema,
	})
	.strict();

export type ConfirmExpiredLockCommand = z.infer<
	typeof confirmExpiredLockCommandSchema
>;
