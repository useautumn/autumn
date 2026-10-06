import type { Auth } from "../../auth/types/auth.js";
import {
	errorToReply,
	wireToCheckRequest,
	wireToStoredSubject,
} from "./ownerCallContract.js";
import type { OwnerCall } from "./types/ownerCall.js";

type OwnerContext = { auth: Pick<Auth, "slotsFor"> };

/** The call run on the slots this thread owns: the same processor a request arriving here would use. */
const runOwnerCall = async ({
	ctx,
	call,
}: {
	ctx: OwnerContext;
	call: OwnerCall;
}) => {
	const slots = ctx.auth.slotsFor({ atomId: call.atomId });
	if (!slots) throw new Error(`This Atom holds no folder ${call.atomId}`);
	if (call.type === "setCatalog") return slots.setCatalog(call.catalog);
	if (call.type === "installCatalog") return slots.installCatalog(call.catalog);
	if (call.type === "setSubject") {
		const subject = wireToStoredSubject({ subject: call.subject });
		const { customerId } = subject.state.identity;
		return slots.processorFor({ customerId }).setSubject({ subject });
	}
	const request = wireToCheckRequest({ request: call.request });
	return slots
		.processorFor({ customerId: request.params.customer_id })
		.check({ request });
};

/** Answers another thread's calls for the customers this thread owns, each as soon as it is done. */
export const answerOwnerCalls = ({
	ctx,
	port,
}: {
	ctx: OwnerContext;
	port: MessagePort;
}): void => {
	async function answer(event: MessageEvent<string>): Promise<void> {
		const call: OwnerCall = JSON.parse(event.data);
		try {
			const value = await runOwnerCall({ ctx, call });
			port.postMessage({ id: call.id, ok: true, value });
		} catch (error) {
			port.postMessage(errorToReply({ id: call.id, error }));
		}
	}
	port.onmessage = answer;
};
