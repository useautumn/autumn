import type { TwdContext } from "../../lib/types/twdContext.ts";

/** Hono env: the auth middleware sets `ctx` (with `actor`) on every authed request. */
export type TwdHono = { Variables: { ctx: TwdContext } };
