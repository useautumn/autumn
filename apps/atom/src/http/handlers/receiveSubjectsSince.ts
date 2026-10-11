import type { Context } from "hono";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import {
	type SubjectsSinceRequest,
	subjectsSinceResponse,
} from "../../replication/catchUp/fetchSince.js";
import type { AtomHttpEnv } from "../types/atomHttp.js";

const MAX_PAGE = 1_000;

/** A peer copying what it missed asks for one slot's subjects read after a point; the slot's owner answers. */
export async function receiveSubjectsSince(context: Context<AtomHttpEnv>) {
	const body = context.get("body") as Partial<SubjectsSinceRequest> | undefined;
	const wellFormed =
		body !== undefined &&
		Number.isInteger(body.slot) &&
		Number.isInteger(body.slotCount) &&
		typeof body.readAtAfter === "number" &&
		Number.isInteger(body.limit);
	if (!wellFormed)
		throw new InvalidPushError(
			"subjects.since needs slot, slotCount, readAtAfter and limit",
		);
	const slots = context.get("slots");
	if (body.slotCount !== slots.slotCount)
		return context.json(
			{
				message: `This replica holds ${slots.slotCount} slots, not ${body.slotCount}`,
				code: "atom_slot_count_mismatch",
			},
			409,
		);
	const subjects = await slots.listSince({
		slot: body.slot as number,
		readAtAfter: body.readAtAfter as number,
		limit: Math.min(body.limit as number, MAX_PAGE),
	});
	return context.json(subjectsSinceResponse(subjects));
}
