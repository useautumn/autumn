import { beforeEach, expect, test } from "bun:test";
import { _resetOrgWithFeaturesL1ForTesting } from "@autumn/cache";
import {
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
} from "@autumn/edge-config";
import {
	AppEnv,
	type AtomRoute,
	ByocCacheStatus,
	type Organization,
} from "@autumn/shared";
import type { AtomConnection } from "../../../../src/atom/types/atomClient.js";
import { pushCatalogToCache } from "../../../../src/consumers/cachePush/pushCatalogToCache/pushCatalogToCache.js";
import { pushSubjectToCache } from "../../../../src/consumers/cachePush/pushSubjectToCache/pushSubjectToCache.js";
import type { CachePushContext } from "../../../../src/consumers/cachePush/types/cachePushContext.js";

const ORG_ATOM = "https://org-atom.example.com";
const SHADOW_ATOM = "https://shadow-atom.example.com";

const org = {
	id: "org_1",
	slug: "org-1",
	config: {},
	default_currency: "usd",
} as unknown as Organization;

/** The org's own sandbox Atom as its cached org holds it, in `status`; none when null. */
const atomDeploymentsIn = ({
	status,
}: {
	status: ByocCacheStatus | null;
}): AtomRoute[] =>
	status
		? [
				{
					status,
					deployment_id: "dep_1",
					endpoint_url: ORG_ATOM,
					encrypted_token: "encrypted",
				},
			]
		: [];

/** The sandbox shadow Atom at `endpointUrl` (null is none), holding every customer or none, with org_1 registered unless told otherwise. */
const shadowWith = ({
	endpointUrl,
	percent = 100,
	registered = true,
	pushTransport = "http",
}: {
	endpointUrl: string | null;
	percent?: number;
	registered?: boolean;
	pushTransport?: "http" | "queue";
}): ShadowAtomConfig =>
	ShadowAtomConfigSchema.parse({
		endpointUrl,
		pushTransport,
		adminEncryptedToken: "encrypted_admin",
		orgs: registered
			? {
					org_1: {
						encryptedTokens: {
							sandbox: "encrypted_org_1",
							live: "encrypted_org_1_live",
						},
						registeredAt: 1,
						percent,
						previousPercent: percent,
					},
				}
			: {},
	});

/** A herald reading org_1 with its own Atom in `atomStatus` (none when null); Atoms record what reached them and `failing` ones reject every push. */
const createPushContext = ({
	atomStatus,
	shadowAtom,
	failing = [],
}: {
	atomStatus: ByocCacheStatus | null;
	shadowAtom: ShadowAtomConfig;
	failing?: string[];
}) => {
	const atomDeployments = atomDeploymentsIn({ status: atomStatus });
	const reached: string[] = [];
	const tokens: Record<string, string> = {};
	const queues: Record<string, AtomConnection["queue"]> = {};
	const logged: { level: "warn" | "error"; target: unknown }[] = [];
	const logAt =
		(level: "warn" | "error") => (meta: { data?: { target?: unknown } }) =>
			logged.push({ level, target: meta?.data?.target });
	const redis = {
		status: "ready",
		get: async () =>
			JSON.stringify({ org: { ...org, atomDeployments }, features: [] }),
	};
	const atomAt = (endpointUrl: string) => async () => {
		if (failing.includes(endpointUrl)) throw new Error("Atom down");
		reached.push(endpointUrl);
	};
	const ctx = {
		miscCache: { resolve: () => redis, forEachTarget: async () => [] },
		logger: {
			info() {},
			warn: logAt("warn"),
			error: logAt("error"),
			debug() {},
		},
		db: {
			query: {
				organizations: {
					findFirst: async () => ({
						...org,
						atom_deployments: atomDeployments,
						features: [],
						product_aliases: [],
					}),
				},
			},
			execute: async () => ({
				rows: [
					{
						envelope: {
							entitlements: [],
							products: [],
							features: [],
							prices: [],
							plan_licenses: [],
							free_trials: [],
						},
					},
				],
			}),
		},
		balanceWorkerClient: {
			readSubjectState: async () => ({ state: {}, catalog: {} }),
		},
		shadowAtomConfig: { get: () => shadowAtom },
		getAtomClient: ({ connection }: { connection: AtomConnection }) => {
			tokens[connection.endpointUrl] = connection.encryptedToken;
			queues[connection.endpointUrl] = connection.queue;
			return {
				setSubject: atomAt(connection.endpointUrl),
				setCatalog: atomAt(connection.endpointUrl),
			};
		},
	} as unknown as CachePushContext;
	return { ctx, reached, logged, tokens, queues };
};

const pushSubject = ({ ctx }: { ctx: CachePushContext }) =>
	pushSubjectToCache({
		ctx,
		cacheSubject: {
			identity: {
				orgId: "org_1",
				env: AppEnv.Sandbox,
				customerId: "cus_1",
				entityId: null,
			},
			logOffset: 1n,
			oldestOccurredAt: 1,
		},
	});

beforeEach(() => _resetOrgWithFeaturesL1ForTesting());

test("an org with its own Atom and no shadow configured: only the org's Atom", async () => {
	const { ctx, reached } = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: null }),
	});
	await pushSubject({ ctx });
	expect(reached).toEqual([ORG_ATOM]);
});

test("an org whose own Atom is not ready yet feeds only the shadow Atom", async () => {
	const { ctx, reached } = createPushContext({
		atomStatus: ByocCacheStatus.Provisioning,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
	});
	await pushSubject({ ctx });
	await pushCatalogToCache({ ctx, orgId: "org_1", env: AppEnv.Sandbox });
	expect(reached).toEqual([SHADOW_ATOM, SHADOW_ATOM]);
});

test("an org with no Atom of its own still feeds the shadow Atom", async () => {
	const { ctx, reached } = createPushContext({
		atomStatus: null,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
	});
	await pushSubject({ ctx });
	expect(reached).toEqual([SHADOW_ATOM]);
});

test("the shadow Atom is reached with the org's own token, and only once the org is registered on it", async () => {
	const registered = createPushContext({
		atomStatus: null,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
	});
	await pushSubject({ ctx: registered.ctx });
	await pushCatalogToCache({
		ctx: registered.ctx,
		orgId: "org_1",
		env: AppEnv.Sandbox,
	});
	expect(registered.reached).toEqual([SHADOW_ATOM, SHADOW_ATOM]);
	expect(registered.tokens[SHADOW_ATOM]).toBe("encrypted_org_1");

	_resetOrgWithFeaturesL1ForTesting();
	const unregistered = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM, registered: false }),
	});
	await pushSubject({ ctx: unregistered.ctx });
	await pushCatalogToCache({
		ctx: unregistered.ctx,
		orgId: "org_1",
		env: AppEnv.Sandbox,
	});
	expect(unregistered.reached).toEqual([ORG_ATOM, ORG_ATOM]);
});

test("a customer in the rollout reaches both; one outside it only the org's Atom", async () => {
	const both = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
	});
	await pushSubject({ ctx: both.ctx });
	expect([...both.reached].sort()).toEqual([ORG_ATOM, SHADOW_ATOM]);

	_resetOrgWithFeaturesL1ForTesting();
	const outside = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM, percent: 0 }),
	});
	await pushSubject({ ctx: outside.ctx });
	expect(outside.reached).toEqual([ORG_ATOM]);
});

test("a shadow Atom that fails never keeps the subject or the catalog from the org's Atom", async () => {
	const { ctx, reached } = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
		failing: [SHADOW_ATOM],
	});
	await pushSubject({ ctx });
	await pushCatalogToCache({ ctx, orgId: "org_1", env: AppEnv.Sandbox });
	expect(reached).toEqual([ORG_ATOM, ORG_ATOM]);
});

test("the catalog goes to every Atom the org's customers can reach", async () => {
	const { ctx, reached } = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
	});
	await pushCatalogToCache({ ctx, orgId: "org_1", env: AppEnv.Sandbox });
	expect([...reached].sort()).toEqual([ORG_ATOM, SHADOW_ATOM]);
});

test("a failed push to an org's own Atom is an error; to our shadow Atom only a warning", async () => {
	for (const [failing, level, target] of [
		[ORG_ATOM, "error", "org"],
		[SHADOW_ATOM, "warn", "shadow"],
	] as const) {
		_resetOrgWithFeaturesL1ForTesting();
		const { ctx, logged } = createPushContext({
			atomStatus: ByocCacheStatus.Ready,
			shadowAtom: shadowWith({ endpointUrl: SHADOW_ATOM }),
			failing: [failing],
		});
		await pushSubject({ ctx });
		await pushCatalogToCache({ ctx, orgId: "org_1", env: AppEnv.Sandbox });
		expect(logged).toEqual([
			{ level, target },
			{ level, target },
		]);
	}
});

test("a shadow Atom set to the queue transport is pushed through its queue into the org's folder; the org's own Atom stays on HTTP", async () => {
	const { ctx, queues } = createPushContext({
		atomStatus: ByocCacheStatus.Ready,
		shadowAtom: shadowWith({
			endpointUrl: SHADOW_ATOM,
			pushTransport: "queue",
		}),
	});
	await pushSubject({ ctx });
	expect(queues).toEqual({
		[ORG_ATOM]: null,
		[SHADOW_ATOM]: {
			externalId: "autumn-internal-shadow-atom",
			atomId: "org_1.sandbox",
		},
	});
});
