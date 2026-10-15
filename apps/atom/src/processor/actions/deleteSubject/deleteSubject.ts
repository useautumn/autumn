import type { DeletedSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

/**
 * Stores a deletion as the subject's newest row; a deleted customer takes every entity held for it, at the same version,
 * so no entity outlives it. False when a newer read of the subject is already held.
 */
export const deleteSubject = async ({
	ctx,
	subject,
}: {
	ctx: SlotProcessorContext;
	subject: DeletedSubject;
}): Promise<boolean> => {
	const { identity } = subject.state;
	const entities = identity.entityId
		? []
		: ctx.sqliteStore.entityIdsOf({ customerId: identity.customerId }).map(
				(entityId): DeletedSubject => ({
					...subject,
					state: { identity: { ...identity, entityId }, deleted: true },
				}),
			);
	const stored = await ctx.sqliteStore.setSubjects({
		subjects: [...entities, subject],
	});
	return stored.at(-1) ?? false;
};
