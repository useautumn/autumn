import type {
	ShadowAtomConfig,
	ShadowAtomOrg,
	ShadowAtomSettings,
} from "./shadowAtomEdgeConfig.js";

export const SHADOW_ATOM_SETTLE_MS =
	process.env.NODE_ENV === "production" ? 15_000 : 5_000;

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

export const applyShadowAtomSettings = ({
	current,
	next,
}: {
	current: ShadowAtomConfig;
	next: ShadowAtomSettings;
}): ShadowAtomConfig => ({ ...current, ...next });
