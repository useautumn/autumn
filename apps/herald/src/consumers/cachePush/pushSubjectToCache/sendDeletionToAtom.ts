import { atomPushFailureLevel } from "../../../atom/atomPushFailureLevel.js";
import { AtomQueueBackoffError } from "../../../atom/queue/createAtomPushQueue.js";
import type {
	AtomConnection,
	AtomDeletedSubjectBody,
} from "../../../atom/types/atomClient.js";
import type { CachePushContext } from "../types/cachePushContext.js";

/** As a subject push: an Atom that does not take the deletion is logged and left behind, never holding back the others. */
export const sendDeletionToAtom = async ({
	ctx,
	atomConnection,
	body,
}: {
	ctx: CachePushContext;
	atomConnection: AtomConnection;
	body: AtomDeletedSubjectBody;
}): Promise<void> => {
	try {
		const atomClient = ctx.getAtomClient({ connection: atomConnection });
		await atomClient.deleteSubject({ body });
	} catch (error) {
		if (error instanceof AtomQueueBackoffError) return;
		ctx.logger[atomPushFailureLevel({ atomConnection })](
			{
				error,
				type: "herald_atom_push_failed",
				data: {
					target: atomConnection.target,
					atomId: atomConnection.id,
					logOffset: body.log_offset,
					endpointUrl: atomConnection.endpointUrl,
				},
			},
			"An Atom did not take a deletion; its copy is stale until the subject next changes",
		);
	}
};
