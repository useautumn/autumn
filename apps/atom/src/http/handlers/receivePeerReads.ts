import type { Context } from "hono";
import { isServing } from "../../init/atomHealth.js";
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
const MAX_FETCH = 500;

type PeerReadContext = Pick<AtomHttpContext, "health" | "now">;
type PeerReadBody = { slotCount?: number; limit?: number; keys?: unknown[] };

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

export const receiveSubjectsSince = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const page = sincePageOf({ ctx, body: asked.body });
		const subjects = await asked.slots.listSince(page);
		return context.json(subjectsSinceResponse({ after: page.after, subjects }));
	};

export const receiveSubjectsDigest = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const page = sincePageOf({ ctx, body: asked.body });
		const digests = await asked.slots.digestSince(page);
		return context.json(subjectsDigestResponse({ after: page.after, digests }));
	};

export const receiveSubjectsFetch = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<SubjectsFetchRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		const subjects = await asked.slots.fetchSubjects(asked.body);
		return context.json(subjectsFetchResponse(subjects));
	};

export const receiveCatalogSince = ({ ctx }: { ctx: PeerReadContext }) =>
	async function receive(context: Context<AtomHttpEnv>) {
		const asked = peerRead<CatalogSinceRequest>({ ctx, context });
		if ("refused" in asked) return asked.refused;
		return context.json(
			catalogSinceResponse(asked.slots.catalogSince(asked.body)),
		);
	};
