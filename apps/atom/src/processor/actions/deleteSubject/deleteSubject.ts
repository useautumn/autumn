import type { DeletedSubject } from "../../../state/types/storedSubject.js";
import type { SlotProcessorContext } from "../../types/slotProcessor.js";

export const deleteSubject = ({
	ctx,
	subject,
}: {
	ctx: SlotProcessorContext;
	subject: DeletedSubject;
}): boolean => {
	const { identity } = subject.state;
	const entities = identity.entityId
		? []
		: ctx.sqliteStore.entityIdsOf({ customerId: identity.customerId }).map(
				(entityId): DeletedSubject => ({
					...subject,
					state: { identity: { ...identity, entityId }, deleted: true },
				}),
			);
	const stored = ctx.sqliteStore.setSubjects({
		subjects: [...entities, subject],
	});
	return stored.at(-1) ?? false;
};
