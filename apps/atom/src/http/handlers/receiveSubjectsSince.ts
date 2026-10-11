import type { Context } from "hono";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import {
	type SubjectsSinceRequest,
	subjectsSinceResponse,
} from "../../peers/peerSync.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

/** A peer copying what it missed asks for one slot's subjects read after a point; the slot's owner answers. */
export async function receiveSubjectsSince(context: Context<AtomHttpEnv>) {
	const body = context.get("body") as Partial<SubjectsSinceRequest> | undefined;
	if (
		!body ||
		!Number.isInteger(body.slot) ||
		!Number.isInteger(body.slotCount) ||
		typeof body.readAtAfter !== "number" ||
		!Number.isInteger(body.limit)
	)
		throw new InvalidPushError(
			"subjects.since needs slot, slotCount, readAtAfter and limit",
		);
	const subjects = await context.get("slots").listSince({
		slot: body.slot as number,
		readAtAfter: body.readAtAfter,
		limit: Math.min(body.limit as number, 1000),
	});
	return context.json(subjectsSinceResponse(subjects));
}
