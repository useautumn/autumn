import type { Env } from "../types";

export const qaEnvStub = ({ env, name }: { env: Env; name: string }) =>
	env.QA_ENV.get(env.QA_ENV.idFromName(name), { locationHint: "weur" });

export const routerStub = ({ env }: { env: Env }) =>
	env.QA_ROUTER.getByName("router");

export const tinybirdStub = ({ env, name }: { env: Env; name: string }) =>
	env.QA_TINYBIRD.get(env.QA_TINYBIRD.idFromName(name), {
		locationHint: "weur",
	});

export const tinybirdHostLabel = (name: string) => `${name}--tb`;
export const TINYBIRD_HOST_SUFFIX = "--tb";
