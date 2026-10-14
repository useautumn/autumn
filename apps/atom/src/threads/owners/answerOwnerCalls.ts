import type { Auth } from "../../auth/types/auth.js";
import {
	isThreadReady,
	type ThreadHealthSource,
} from "../../init/atomHealth.js";
import {
	appliedSubjectToWire,
	digestToWire,
	errorToReply,
	wireToCheckRequest,
	wireToFinalizeRequest,
	wireToTrackRequest,
} from "./ownerCallContract.js";
import { OwnerUnavailableError } from "./ownerUnavailableError.js";
import type { OwnerCall } from "./types/ownerCall.js";

type OwnerContext = {
	auth: Pick<Auth, "slotsFor">;
	health: Pick<ThreadHealthSource, "threadsReady" | "thread">;
};

/** Answered from this thread's files, so refused until it has caught up: what it missed while it was down is not there yet. */
const READS = new Set<OwnerCall["type"]>([
	"check",
	"track",
	"finalize",
	"listSince",
	"digestSince",
	"fetchSubjects",
]);

/** The call run on the slots this thread owns: the same processor a request arriving here would use. */
const runOwnerCall = async ({
	ctx,
	call,
}: {
	ctx: OwnerContext;
	call: OwnerCall;
}) => {
	if (READS.has(call.type) && !isThreadReady(ctx.health))
		throw new OwnerUnavailableError({ thread: ctx.health.thread });
	const slots = ctx.auth.slotsFor({ atomId: call.atomId });
	if (!slots) throw new Error(`This Atom holds no folder ${call.atomId}`);
	if (call.type === "setCatalog") return slots.setCatalog(call.catalog);
	if (call.type === "installCatalog") return slots.installCatalog(call.catalog);
	if (call.type === "setSubject")
		return slots
			.processorFor({ customerId: call.customerId })
			.setSubject({ customerId: call.customerId, body: call.body });
	if (call.type === "deleteSubject")
		return slots
			.processorFor({ customerId: call.customerId })
			.deleteSubject({ customerId: call.customerId, body: call.body });
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
	if (call.type === "track") {
		const request = wireToTrackRequest({ request: call.request });
		return slots
			.processorFor({ customerId: request.params.customer_id })
			.track({ request });
	}
	if (call.type === "finalize") {
		const request = wireToFinalizeRequest({ request: call.request });
		return slots
			.processorFor({ customerId: request.params.customer_id })
			.finalize({ request });
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
	async function answer(
		event: MessageEvent<string | OwnerCall>,
	): Promise<void> {
		const call: OwnerCall =
			typeof event.data === "string" ? JSON.parse(event.data) : event.data;
		try {
			const value = await runOwnerCall({ ctx, call });
			port.postMessage({ id: call.id, ok: true, value });
		} catch (error) {
			port.postMessage(errorToReply({ id: call.id, error }));
		}
	}
	port.onmessage = answer;
};
