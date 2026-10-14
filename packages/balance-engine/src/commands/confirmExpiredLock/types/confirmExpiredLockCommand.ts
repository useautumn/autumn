import { z } from "zod/v4";
import { mutatingCommandSchema } from "../../../models/command/baseCommand.js";
import { openLockSchema } from "../../../models/subject/rows/workerLock.js";

export const confirmExpiredLockCommandSchema = mutatingCommandSchema
	.extend({
		type: z.literal("confirmExpiredLock"),
		lock: openLockSchema,
	})
	.loose();

export type ConfirmExpiredLockCommand = z.infer<
	typeof confirmExpiredLockCommandSchema
>;
