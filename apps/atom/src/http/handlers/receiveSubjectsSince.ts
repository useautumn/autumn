import type { Context } from "hono";
import { isAtomReady } from "../../init/atomHealth.js";
import { InvalidPushError } from "../../lib/contracts/invalidPushError.js";
import {
	type CatalogSinceRequest,
	catalogSinceResponse,
	type SubjectsFetchRequest,
	type SubjectsSinceRequest,
	subjectsDigestResponse,
	subjectsFetchResponse,
	subjectsSinceResponse,
} from "../../replication/catchUp/fetchSince.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

const MAX_PAGE = 1_000;

const isCursor = (value: unknown): value is SubjectsSinceRequest["cursor"] =>
	value === null ||
	(typeof value === "object" &&
		value !== null &&
		typeof (value as { appliedAt: unknown }).appliedAt === "number" &&
		typeof (value as { customerId: unknown }).customerId === "string" &&
		typeof (value as { entityId: unknown }).entityId === "string");

const notReady = (context: Context<AtomHttpEnv>) =>
	context.json(
		{ message: "This replica is still catching up", code: "atom_not_ready" },
		503,
	);

const MAX_FETCH = 500;

type SinceContext = Pick<AtomHttpContext, "health" | "now">;

/** The page a peer asks for, checked and with its window turned into a point by this replica's clock; or the refusal. */
const sincePageOf = ({
	ctx,
	context,
}: {
	ctx: SinceContext;
	context: Context<AtomHttpEnv>;
}) => {
	const body = context.get("body") as Partial<SubjectsSinceRequest> | undefined;
	const wellFormed =
		body !== undefined &&
		Number.isInteger(body.slot) &&
		Number.isInteger(body.slotCount) &&
		(body.after === null || typeof body.after === "number") &&
		(body.window === null || typeof body.window === "number") &&
		isCursor(body.cursor ?? null) &&
		Number.isInteger(body.limit);
	if (!wellFormed)
		throw new InvalidPushError(
			"subjects.since needs slot, slotCount, after, window, cursor and limit",
		);
	const slots = context.get("slots");
	if (body.slotCount !== slots.slotCount)
		return {
			refused: context.json(
				{
					message: `This replica holds ${slots.slotCount} slots, not ${body.slotCount}`,
					code: "atom_slot_count_mismatch",
				},
				409,
			),
		};
	const now = (ctx.now ?? Date.now)();
	const after =
		body.after ??
		(body.window === null || body.window === undefined
			? null
			: now - body.window);
	return {
		slots,
		page: {
			slot: body.slot as number,
			after,
			cursor: body.cursor ?? null,
			limit: Math.min(body.limit as number, MAX_PAGE),
		},
	};
};

/**
 * A peer copying what it missed asks for one slot's subjects written since a point by this replica's clock; the
 * slot's owner answers. While this replica is not ready its own store may be behind, so it answers nothing.
 */
export const receiveSubjectsSince = ({ ctx }: { ctx: SinceContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		if (!isAtomReady(ctx.health)) return notReady(context);
		const asked = sincePageOf({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const subjects = await asked.slots.listSince(asked.page);
		return context.json(
			subjectsSinceResponse({ after: asked.page.after, subjects }),
		);
	};

/** The same page as identities and versions only. */
export const receiveSubjectsDigest = ({ ctx }: { ctx: SinceContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		if (!isAtomReady(ctx.health)) return notReady(context);
		const asked = sincePageOf({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const digests = await asked.slots.digestSince(asked.page);
		return context.json(
			subjectsDigestResponse({ after: asked.page.after, digests }),
		);
	};

const isKey = (value: unknown): value is SubjectsFetchRequest["keys"][number] =>
	typeof value === "object" &&
	value !== null &&
	typeof (value as { customerId: unknown }).customerId === "string" &&
	typeof (value as { entityId: unknown }).entityId === "string";

/** The rows a peer found newer by their digests. */
export const receiveSubjectsFetch = ({ ctx }: { ctx: SinceContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		if (!isAtomReady(ctx.health)) return notReady(context);
		const body = context.get("body") as
			| Partial<SubjectsFetchRequest>
			| undefined;
		const wellFormed =
			body !== undefined &&
			Number.isInteger(body.slot) &&
			Number.isInteger(body.slotCount) &&
			Array.isArray(body.keys) &&
			body.keys.length <= MAX_FETCH &&
			body.keys.every(isKey);
		if (!wellFormed)
			throw new InvalidPushError(
				`subjects.fetch needs slot, slotCount and up to ${MAX_FETCH} keys`,
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
		const subjects = await slots.fetchSubjects({
			slot: body.slot as number,
			keys: body.keys as SubjectsFetchRequest["keys"],
		});
		return context.json(subjectsFetchResponse(subjects));
	};

/** The shared catalog, when this replica read it after the point the peer names. */
export const receiveCatalogSince = ({
	ctx,
}: {
	ctx: Pick<AtomHttpContext, "health">;
}) =>
	function receive(context: Context<AtomHttpEnv>) {
		if (!isAtomReady(ctx.health)) return notReady(context);
		const body = context.get("body") as
			| Partial<CatalogSinceRequest>
			| undefined;
		if (body === undefined || typeof body.readAtAfter !== "number")
			throw new InvalidPushError("catalog.since needs readAtAfter");
		return context.json(
			catalogSinceResponse(
				context.get("slots").catalogSince({ readAtAfter: body.readAtAfter }),
			),
		);
	};
