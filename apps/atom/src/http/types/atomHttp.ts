import type { AutumnLogger } from "@autumn/logging";
import type { SecretKeys } from "../../auth/secretKeys/types/secretKeys.js";
import type { Auth } from "../../auth/types/auth.js";
import type { ThreadHealthSource } from "../../init/atomHealth.js";
import type { MultiTenantContext } from "../../multiTenant/multiTenantContext.js";
import type { Replication } from "../../replication/types/replication.js";
import type { Slots } from "../../slots/types/slots.js";
import type { LoopWatch } from "../../threads/stats/startLoopWatch.js";
import type { ThreadCounters } from "../../threads/stats/threadStats.js";

export type AtomHttpContext = {
	auth: Auth;
	logger: Pick<AutumnLogger, "info" | "warn" | "error">;
	autumnApiUrl: string;
	health: ThreadHealthSource;
	counters: ThreadCounters;
	loop: Pick<LoopWatch, "lagMs">;
	multiTenant?: MultiTenantContext;
	secretKeys?: SecretKeys;
	replication: Replication;
	peer: { port: number; fetch?: typeof fetch };
	now?: () => number;
};

export type AtomFailure = {
	code: string;
	error: Error;
	target?: string;
};

export type AtomHttpEnv = {
	Variables: {
		body: unknown;
		slots: Slots;
		allowed?: boolean;
		relayed?: boolean;
		failure?: AtomFailure;
	};
};
