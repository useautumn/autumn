import type { Env } from "../types";

// Neon lives in eu-west-2 and a container runs beside its Durable Object, so pin both to Western Europe.
export const qaEnvStub = ({ env, name }: { env: Env; name: string }) =>
	env.QA_ENV.get(env.QA_ENV.idFromName(name), { locationHint: "weur" });

export const routerStub = ({ env }: { env: Env }) =>
	env.QA_ROUTER.getByName("router");

export const tinybirdStub = ({ env, name }: { env: Env; name: string }) =>
	env.QA_TINYBIRD.get(env.QA_TINYBIRD.idFromName(name), {
		locationHint: "weur",
	});

/** Tinybird's own hostname label; env names never contain `--`, so it can't collide with an env. */
export const tinybirdHostLabel = (name: string) => `${name}--tb`;
export const TINYBIRD_HOST_SUFFIX = "--tb";
