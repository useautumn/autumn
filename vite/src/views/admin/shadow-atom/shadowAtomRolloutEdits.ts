import type {
	ShadowAtomConfigView,
	ShadowAtomEnv,
	ShadowAtomRollout,
} from "./shadowAtomTypes";

const withoutKey = <Value>(record: Record<string, Value>, key: string) =>
	Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

export const setOrgPercent = ({
	rollout,
	orgId,
	percent,
}: {
	rollout: ShadowAtomRollout;
	orgId: string;
	percent: number;
}): ShadowAtomRollout => ({
	...rollout,
	orgs: { ...rollout.orgs, [orgId]: percent },
});

export const removeOrgPercent = ({
	rollout,
	orgId,
}: {
	rollout: ShadowAtomRollout;
	orgId: string;
}): ShadowAtomRollout => ({
	...rollout,
	orgs: withoutKey(rollout.orgs, orgId),
});

export const pinCustomer = ({
	rollout,
	orgId,
	customerId,
	included,
}: {
	rollout: ShadowAtomRollout;
	orgId: string;
	customerId: string;
	included: boolean;
}): ShadowAtomRollout => ({
	...rollout,
	customers: {
		...rollout.customers,
		[orgId]: { ...rollout.customers[orgId], [customerId]: included },
	},
});

/** Drops the org's entry once its last pin goes, so the saved file stays tidy. */
export const unpinCustomer = ({
	rollout,
	orgId,
	customerId,
}: {
	rollout: ShadowAtomRollout;
	orgId: string;
	customerId: string;
}): ShadowAtomRollout => {
	const remaining = withoutKey(rollout.customers[orgId] ?? {}, customerId);
	const others = withoutKey(rollout.customers, orgId);
	return {
		...rollout,
		customers:
			Object.keys(remaining).length > 0
				? { ...others, [orgId]: remaining }
				: others,
	};
};

/** The PUT body: both envs' address and rollout, with only `env`'s rollout replaced; the server keeps tokens and orgs. */
export const toShadowAtomSettings = ({
	config,
	env,
	rollout,
}: {
	config: ShadowAtomConfigView;
	env: ShadowAtomEnv;
	rollout: ShadowAtomRollout;
}) => ({
	sandbox: {
		endpointUrl: config.sandbox.endpointUrl,
		rollout: env === "sandbox" ? rollout : config.sandbox.rollout,
	},
	live: {
		endpointUrl: config.live.endpointUrl,
		rollout: env === "live" ? rollout : config.live.rollout,
	},
});

/** Every pin as one row, for listing. */
export const rolloutToCustomerPins = ({
	rollout,
}: {
	rollout: ShadowAtomRollout;
}) =>
	Object.entries(rollout.customers).flatMap(([orgId, customers]) =>
		Object.entries(customers).map(([customerId, included]) => ({
			orgId,
			customerId,
			included,
		})),
	);
