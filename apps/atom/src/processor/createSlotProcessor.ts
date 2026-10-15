import { deletePushToDeletedSubject } from "../lib/contracts/deleteSubjectContract.js";
import { subjectPushToStoredSubject } from "../lib/contracts/subjectContract.js";
import { CannotAnswerError } from "../lib/forward/cannotAnswerError.js";
import { check } from "./actions/check/check.js";
import { checkResponseToJson } from "./actions/check/checkResponseToJson.js";
import { deleteSubject } from "./actions/deleteSubject/deleteSubject.js";
import { finalize } from "./actions/finalize/finalize.js";
import { setSubject } from "./actions/setSubject/setSubject.js";
import { track } from "./actions/track/track.js";
import { createCallerKeyClaims } from "./callerKeys/createCallerKeyClaims.js";
import {
	checkCallerKeyOf,
	trackCallerKeyOf,
} from "./callerKeys/requestCallerKeyOf.js";
import { CustomerMovedError } from "./ownership/customerMovedError.js";
import { beginRequest } from "./ownership/inFlightRequests.js";
import type {
	SlotProcessor,
	SlotProcessorContext,
} from "./types/slotProcessor.js";

export const createSlotProcessor = ({
	ctx,
}: {
	ctx: SlotProcessorContext;
}): SlotProcessor => {
	/** Customers whose latest push failed to store (a full or failing disk): their rows are older than what Autumn sent. */
	const unwritten = new Set<string>();
	// A caller's key is claimed here, around the request, as the API's middleware claims it around the route.
	const callerKeys = createCallerKeyClaims({ journal: ctx.journal });

	const refuseUnwritten = ({
		customer_id: customerId,
		entity_id: entityId,
	}: {
		customer_id: string;
		entity_id?: string;
	}) => {
		if (!unwritten.has(customerId)) return;
		ctx.subjectPulls.request({ customerId, entityId: entityId ?? null });
		throw new CannotAnswerError({ reason: "subject_not_written" });
	};

	const awaitHandoff = async ({
		customerId,
		movedFrom,
	}: {
		customerId: string;
		movedFrom: string | null;
	}) => {
		if (movedFrom && ctx.barrier)
			await ctx.barrier.wait({ customerId, from: movedFrom });
	};

	/** A straggler for a customer whose owner changed on its way here is not decided from this copy; one the previous owner hopped here is. */
	const refuseMoved = async ({
		customerId,
		movedFrom,
	}: {
		customerId: string;
		movedFrom: string | null;
	}) => {
		if (!ctx.ring) return;
		const owner = await ctx.ring.ownerOf({ customerId });
		if (owner !== ctx.ring.self && owner !== movedFrom)
			throw new CustomerMovedError({ owner });
	};

	/** Parked for its handoff when the customer just moved here, refused when it moved away, counted in flight meanwhile. */
	const decide = async <T>({
		customerId,
		movedFrom,
		run,
	}: {
		customerId: string;
		movedFrom: string | null;
		run: () => Promise<T>;
	}): Promise<T> => {
		// The handoff first: a moved customer's keys arrive with its entries, so the claim reads them.
		await awaitHandoff({ customerId, movedFrom });
		const request = beginRequest();
		try {
			await refuseMoved({ customerId, movedFrom });
			return await run();
		} finally {
			request.done();
		}
	};

	return {
		check: async ({ request }) => {
			refuseUnwritten(request.params);
			return decide({
				customerId: request.params.customer_id,
				movedFrom: request.movedFrom,
				run: () =>
					callerKeys.run({
						customerId: request.params.customer_id,
						key: checkCallerKeyOf({ request }),
						run: async () => {
							const { response, result } = await check({ ctx, request });
							return {
								json: checkResponseToJson({ response }),
								allowed: response.allowed,
								denial: response.allowed
									? null
									: { reason: result.reason, limitType: result.limitType },
							};
						},
					}),
			});
		},
		track: async ({ request }) => {
			refuseUnwritten(request.params);
			return decide({
				customerId: request.params.customer_id,
				movedFrom: request.movedFrom,
				run: () =>
					callerKeys.run({
						customerId: request.params.customer_id,
						key: trackCallerKeyOf({ request }),
						run: () => track({ ctx, request }),
					}),
			});
		},
		finalize: async ({ request }) => {
			refuseUnwritten(request.params);
			return decide({
				customerId: request.params.customer_id,
				movedFrom: request.movedFrom,
				run: () => finalize({ ctx, request }),
			});
		},
		setSubject: async (params) => {
			const subject = subjectPushToStoredSubject(params);
			try {
				const stored = await setSubject({ ctx, subject });
				unwritten.delete(params.customerId);
				return { stored, entityId: subject.state.identity.entityId ?? null };
			} catch (error) {
				unwritten.add(params.customerId);
				throw error;
			}
		},
		receiveHandoff: async ({ handoffs }) => {
			const held = await ctx.journal.appendForeign({
				entries: handoffs.flatMap(({ entries }) => entries),
			});
			// The old owner's locks: their finalize finds the row here, as if this slot had taken them.
			for (const lock of handoffs.flatMap(({ locks }) => locks))
				ctx.openLocks.hold(lock);
			for (const { customerId } of handoffs)
				ctx.barrier?.arrived({ customerId });
			return { held };
		},
		receiveRelayedKeys: async ({ keys }) => ({
			held: await ctx.journal.receiveKeys({ keys }),
		}),
		deleteSubject: async (params) =>
			deleteSubject({ ctx, subject: deletePushToDeletedSubject(params) }),
	};
};
