import { atomPushFailureLevel } from "../../../atom/atomPushFailureLevel.js";
import type {
	AtomConnection,
	AtomSubjectBody,
} from "../../../atom/types/atomClient.js";
import type { CachePushContext } from "../types/cachePushContext.js";

/** An Atom that does not take the subject is logged and left behind: it never holds back the log or the subject's other Atoms. */
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
