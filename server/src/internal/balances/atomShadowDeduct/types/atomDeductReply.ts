import type { CheckParams, TrackParams } from "@autumn/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** A deduction the shadow Atom is asked first, as the caller sent it. */
export type AtomDeductCall =
	| { route: "check"; params: CheckParams }
	| { route: "track"; params: TrackParams };

/** How the shadow Atom met a deduction, by the SDK edge's rules: only `down` means the API never saw it from Atom. */
export type AtomDeductReply =
	| { kind: "answered"; status: ContentfulStatusCode; body: unknown }
	| { kind: "forwarded"; reason: string }
	| { kind: "down"; reason: string };

/** What the route answers with, from either leg. */
export type DeductionResponse = { body: unknown; status: ContentfulStatusCode };
