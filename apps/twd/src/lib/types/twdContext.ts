import type { TwdEnv } from "../env.ts";
import type { TwdDb } from "../getDb.ts";
import type { TwdLogger } from "../logger.ts";
import type { Actor } from "./actor.ts";

/** Ambient dependencies for every action. `actor` is set on authenticated requests. */
export type TwdContext = {
	db: TwdDb;
	env: TwdEnv;
	logger: TwdLogger;
	actor?: Actor;
};
