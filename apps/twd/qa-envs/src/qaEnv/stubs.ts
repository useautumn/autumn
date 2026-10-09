import type { Env } from "../types";

// Neon lives in eu-west-2 and a container runs beside its Durable Object, so pin both to Western Europe.
export const qaEnvStub = ({ env, name }: { env: Env; name: string }) =>
	env.QA_ENV.get(env.QA_ENV.idFromName(name), { locationHint: "weur" });

export const routerStub = ({ env }: { env: Env }) =>
	env.QA_ROUTER.getByName("router");
