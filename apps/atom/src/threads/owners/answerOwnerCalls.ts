import type { Auth } from "../../auth/types/auth.js";
import {
	appliedSubjectToWire,
	digestToWire,
	errorToReply,
	wireToCheckRequest,
} from "./ownerCallContract.js";
import { createPortBatcher } from "./portBatcher.js";
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
	if (call.type === "setSubject")
		return slots
			.processorFor({ customerId: call.customerId })
			.setSubject({ customerId: call.customerId, body: call.body });
	if (call.type === "listSince")
		return (
			await slots.listSince({
				slot: call.slot,
				after: call.after,
				cursor: call.cursor,
				limit: call.limit,
			})
		).map(appliedSubjectToWire);
	if (call.type === "digestSince")
		return (
			await slots.digestSince({
				slot: call.slot,
				after: call.after,
				cursor: call.cursor,
				limit: call.limit,
			})
		).map(digestToWire);
	if (call.type === "fetchSubjects")
		return (
			await slots.fetchSubjects({ slot: call.slot, keys: call.keys })
		).map(appliedSubjectToWire);
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
	const send = createPortBatcher();

	async function answer(sent: string | OwnerCall): Promise<void> {
		const call: OwnerCall = typeof sent === "string" ? JSON.parse(sent) : sent;
		try {
			const value = await runOwnerCall({ ctx, call });
			send({ port, message: { id: call.id, ok: true, value } });
		} catch (error) {
			send({ port, message: errorToReply({ id: call.id, error }) });
		}
	}
	port.onmessage = (event: MessageEvent<(string | OwnerCall)[]>) => {
		for (const sent of event.data) void answer(sent);
	};
};
