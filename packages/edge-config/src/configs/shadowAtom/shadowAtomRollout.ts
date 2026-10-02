import type {
	ShadowAtomConfig,
	ShadowAtomEnvConfig,
	ShadowAtomRollout,
	ShadowAtomSettings,
} from "./shadowAtomEdgeConfig.js";

/** Past every reader's config poll (10s in production, 1s locally), so server and herald flip together. */
export const SHADOW_ATOM_SETTLE_MS =
	process.env.NODE_ENV === "production" ? 15_000 : 5_000;

/** The balance-worker rollout's bucket, copied: 0–99 from the customer id, so an entity goes with its customer. */
const customerBucket = ({ customerId }: { customerId: string }): number =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

const routingPercentAt = ({
	rollout,
	now,
}: {
	rollout: ShadowAtomRollout;
	now: number;
}): number =>
	now >= rollout.changedAt + SHADOW_ATOM_SETTLE_MS
		? rollout.percent
		: rollout.previousPercent;

/** A pinned customer, else the org's percent, else the env's percent as it routes now. */
export const inAtomRollout = ({
	config,
	orgId,
	customerId,
	now = Date.now(),
}: {
	config: ShadowAtomEnvConfig;
	orgId: string;
	customerId: string;
	now?: number;
}): boolean => {
	const { rollout } = config;
	const pinned = rollout.customers[orgId]?.[customerId];
	if (pinned !== undefined) return pinned;
	const percent = rollout.orgs[orgId] ?? routingPercentAt({ rollout, now });
	return customerBucket({ customerId }) < percent;
};

const scheduleRollout = ({
	current,
	next,
	now,
}: {
	current: ShadowAtomRollout;
	next: ShadowAtomRollout;
	now: number;
}): ShadowAtomRollout =>
	next.percent === current.percent
		? {
				...next,
				previousPercent: current.previousPercent,
				changedAt: current.changedAt,
			}
		: {
				...next,
				previousPercent: routingPercentAt({ rollout: current, now }),
				changedAt: now,
			};

const scheduleEnv = ({
	current,
	next,
	now,
}: {
	current: ShadowAtomEnvConfig;
	next: ShadowAtomSettings["sandbox"];
	now: number;
}): ShadowAtomEnvConfig => ({
	...current,
	endpointUrl: next.endpointUrl,
	rollout: scheduleRollout({
		current: current.rollout,
		next: next.rollout,
		now,
	}),
});

/** The config an admin saved: only its address and rollout change, a new percent starting from what routes now; tokens and orgs stay. */
export const scheduleShadowAtomConfig = ({
	current,
	next,
	now,
}: {
	current: ShadowAtomConfig;
	next: ShadowAtomSettings;
	now: number;
}): ShadowAtomConfig => ({
	sandbox: scheduleEnv({ current: current.sandbox, next: next.sandbox, now }),
	live: scheduleEnv({ current: current.live, next: next.live, now }),
});
