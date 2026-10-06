import type {
	ShadowAtomConfig,
	ShadowAtomOrg,
	ShadowAtomSettings,
} from "./shadowAtomEdgeConfig.js";

/** Past every reader's config poll (10s in production, 1s locally), so server and herald flip together. */
export const SHADOW_ATOM_SETTLE_MS =
	process.env.NODE_ENV === "production" ? 15_000 : 5_000;

/** The balance-worker rollout's bucket, copied: 0–99 from the customer id, so an entity goes with its customer. */
const customerBucket = ({ customerId }: { customerId: string }): number =>
	Number(BigInt(Bun.hash(customerId)) % 100n);

const routingPercentAt = ({
	org,
	now,
}: {
	org: ShadowAtomOrg;
	now: number;
}): number =>
	now >= org.changedAt + SHADOW_ATOM_SETTLE_MS
		? org.percent
		: org.previousPercent;

/** Only a registered org's customers, in either env, and of those its percent as it routes now. */
export const inAtomRollout = ({
	config,
	orgId,
	customerId,
	now = Date.now(),
}: {
	config: ShadowAtomConfig;
	orgId: string;
	customerId: string;
	now?: number;
}): boolean => {
	const org = Object.hasOwn(config.orgs, orgId) ? config.orgs[orgId] : null;
	if (!org) return false;
	return customerBucket({ customerId }) < routingPercentAt({ org, now });
};

/** An org's routing fields for a new percent: it starts from what routes now and lands once settled. */
export const scheduleOrgPercent = ({
	current,
	percent,
	now,
}: {
	current: ShadowAtomOrg | undefined;
	percent: number;
	now: number;
}): Pick<ShadowAtomOrg, "percent" | "previousPercent" | "changedAt"> => {
	if (current?.percent === percent)
		return {
			percent,
			previousPercent: current.previousPercent,
			changedAt: current.changedAt,
		};
	return {
		percent,
		previousPercent: current ? routingPercentAt({ org: current, now }) : 0,
		changedAt: now,
	};
};

/** The config an admin saved: only the address changes; tokens and orgs stay. */
export const applyShadowAtomSettings = ({
	current,
	next,
}: {
	current: ShadowAtomConfig;
	next: ShadowAtomSettings;
}): ShadowAtomConfig => ({ ...current, ...next });
