import type { ContentfulStatusCode } from "hono/utils/http-status";

/** How the shadow Atom met a deduction, by the SDK edge's rules: only `down` means the API never saw it from Atom. */
export type AtomDeductReply =
	| { kind: "answered"; status: ContentfulStatusCode; body: unknown }
	| { kind: "forwarded"; reason: string }
	| { kind: "down"; reason: string };

export type AtomDeductAnswer = Extract<AtomDeductReply, { kind: "answered" }>;

/** What the route answers with, from either leg. */
export type DeductionResponse = { body: unknown; status: ContentfulStatusCode };
