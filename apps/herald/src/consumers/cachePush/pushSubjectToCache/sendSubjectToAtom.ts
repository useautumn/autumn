import { atomPushFailureLevel } from "../../../atom/atomPushFailureLevel.js";
import { AtomQueueBackoffError } from "../../../atom/queue/createAtomPushQueue.js";
import type {
	AtomConnection,
	AtomSubjectBody,
} from "../../../atom/types/atomClient.js";
import type { CachePushContext } from "../types/cachePushContext.js";

export const sendSubjectToAtom = async ({
	ctx,
	atomConnection,
	body,
}: {
	ctx: CachePushContext;
	atomConnection: AtomConnection;
	body: AtomSubjectBody;
}): Promise<void> => {
	try {
		const atomClient = ctx.getAtomClient({ connection: atomConnection });
		await atomClient.setSubject({ body });
	} catch (error) {
		if (error instanceof AtomQueueBackoffError) return;
		ctx.logger[atomPushFailureLevel({ atomConnection })](
			{
				error,
				type: "herald_atom_push_failed",
				data: {
					target: atomConnection.target,
					logOffset: body.log_offset,
					endpointUrl: atomConnection.endpointUrl,
				},
			},
			"An Atom did not take a subject; its copy is stale until the subject next changes",
		);
	}
};
