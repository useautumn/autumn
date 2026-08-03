import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";

export const rewardMutationLock =
	process.env.NODE_ENV !== "development"
		? {
				ttlMs: 120_000,
				errorMessage:
					"Another reward operation is already in progress for this organization, try again in a few seconds",
				getKey: (c: Context<HonoEnv>) => {
					const { org, env } = c.get("ctx");
					return `reward:${org.id}:${env}`;
				},
			}
		: undefined;
