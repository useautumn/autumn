import { z } from "zod/v4";
import type { DeletedSubject } from "../../state/types/storedSubject.js";
import { InvalidPushError, isUnreadableRequest } from "./invalidPushError.js";

const deleteBodySchema = z.object({
	identity: z.object({
		orgId: z.string().min(1),
		env: z.string().min(1),
		customerId: z.string().min(1),
		entityId: z.string().min(1).nullable(),
	}),
	log_offset: z.string().regex(/^\d+$/),
	read_at: z.number().int().nonnegative(),
});

export const deletePushToDeletedSubject = ({
	customerId,
	body,
}: {
	customerId: string;
	body: string;
}): DeletedSubject => {
	let parsed: z.infer<typeof deleteBodySchema>;
	try {
		parsed = deleteBodySchema.parse(JSON.parse(body));
	} catch (error) {
		if (!isUnreadableRequest(error)) throw error;
		throw new InvalidPushError((error as Error).message);
	}
	if (parsed.identity.customerId !== customerId)
		throw new InvalidPushError(
			`A delete routed to customer ${customerId} names customer ${parsed.identity.customerId}`,
		);
	return {
		state: { identity: parsed.identity, deleted: true },
		catalog: null,
		org: null,
		logOffset: BigInt(parsed.log_offset),
		readAt: parsed.read_at,
		customerVersion: 0n,
	};
};
