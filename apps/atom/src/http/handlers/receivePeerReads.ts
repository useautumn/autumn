import type { Context } from "hono";
import { isServing } from "../../init/atomHealth.js";
import {
	type CatalogSinceRequest,
	catalogSinceResponse,
	type RecentKeysRequest,
	type RecentKeysResponse,
	type SubjectsFetchRequest,
	type SubjectsSinceRequest,
	subjectsDigestResponse,
	subjectsFetchResponse,
	subjectsSinceResponse,
} from "../../replication/catchUp/fetchSince.js";
import type { AtomHttpContext, AtomHttpEnv } from "../types/atomHttp.js";

const MAX_PAGE = 1_000;
const MAX_FETCH = 500;

type PeerReadContext = Pick<AtomHttpContext, "health" | "now">;
type PeerReadBody = { slotCount?: number; limit?: number; keys?: unknown[] };

/**
 * Only this deployment's own replicas reach these routes, on the private port and signed, so the body is taken as
 * typed, with its page and key counts capped. While this replica or thread is not ready its store may be behind, so it
 * answers nothing; a peer split into a different number of slots holds nothing this one can copy.
 */
const peerRead = <Body extends object>({
	ctx,
	context,
}: {
	ctx: Pick<AtomHttpContext, "health">;
	context: Context<AtomHttpEnv>;
}) => {
	if (!isServing(ctx.health))
		return {
			refused: context.json(
				{
					message: "This replica is still catching up",
					code: "atom_not_ready",
				},
				503,
			),
		};
	const body = context.get("body") as Body & PeerReadBody;
	const slots = context.get("slots");
	if (body.slotCount !== undefined && body.slotCount !== slots.slotCount)
		return {
			refused: context.json(
				{
					message: `This replica holds ${slots.slotCount} slots, not ${body.slotCount}`,
					code: "atom_slot_count_mismatch",
				},
				409,
			),
		};
	const capped: Body = {
		...body,
		...(body.limit !== undefined && { limit: Math.min(body.limit, MAX_PAGE) }),
		...(body.keys !== undefined && { keys: body.keys.slice(0, MAX_FETCH) }),
	};
	return { body: capped, slots };
};

/** The page asked for, its window turned into a point by this replica's clock. */
const sincePageOf = ({
	ctx,
	body,
}: {
	ctx: PeerReadContext;
	body: SubjectsSinceRequest;
}) => ({
	slot: body.slot,
	after:
		body.after ??
		(body.window === null ? null : (ctx.now ?? Date.now)() - body.window),
	cursor: body.cursor,
	limit: body.limit,
});

/** A peer copying what it missed asks for one slot's subjects written since a point by this replica's clock; the slot's owner answers. */
export const receiveSubjectsSince = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const page = sincePageOf({ ctx, body: asked.body });
		const subjects = await asked.slots.listSince(page);
		return context.json(subjectsSinceResponse({ after: page.after, subjects }));
	};

/** The same page as identities and versions only. */
export const receiveSubjectsDigest = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const page = sincePageOf({ ctx, body: asked.body });
		const digests = await asked.slots.digestSince(page);
		return context.json(subjectsDigestResponse({ after: page.after, digests }));
	};

/** The rows a peer found newer by their digests. */
export const receiveSubjectsFetch = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsFetchRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const subjects = await asked.slots.fetchSubjects(asked.body);
		return context.json(subjectsFetchResponse(subjects));
	};

/** The shared catalog, when this replica read it after the point the peer names. */
export const receiveCatalogSince = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<CatalogSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		return context.json(
			catalogSinceResponse(asked.slots.catalogSince(asked.body)),
		);
	};

/** A page of one slot's idempotency keys taken within the key window, for a peer copying them before it serves. */
export const receiveRecentKeys = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<RecentKeysRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const keys = await asked.slots.recentKeys(asked.body);
		return context.json({ keys } satisfies RecentKeysResponse);
	};
