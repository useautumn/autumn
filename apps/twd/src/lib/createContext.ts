import { getTwdEnv } from "./env.ts";
import { getDb } from "./getDb.ts";
import { getLogger } from "./logger.ts";
import type { Actor } from "./types/actor.ts";
import type { TwdContext } from "./types/twdContext.ts";

export const createContext = ({
	actor,
}: {
	actor?: Actor;
} = {}): TwdContext => ({
	db: getDb(),
	env: getTwdEnv(),
	logger: getLogger(),
	actor,
});

export const SYSTEM_ACTOR: Actor = {
	userId: "system",
	email: "system@useautumn.com",
	via: "system",
};
