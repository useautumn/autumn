import { expect, test } from "bun:test";
import {
	type ShadowAtomConfig,
	ShadowAtomConfigSchema,
} from "@autumn/edge-config";
import { createShadowAtomCatalogPush } from "../../../../src/consumers/cachePush/pushCatalogToCache/createShadowAtomCatalogPush.js";

const SHADOW_ATOM = "https://shadow-atom.example.com";

const registered = (orgIds: string[]) =>
	Object.fromEntries(
		orgIds.map((orgId) => [
			orgId,
			{
				encryptedTokens: { sandbox: "enc_sandbox", live: "enc_live" },
				registeredAt: 1,
				percent: 100,
			},
		]),
	);

const shadowWith = ({
	orgIds,
	endpointUrl = SHADOW_ATOM,
}: {
	orgIds: string[];
	endpointUrl?: string | null;
}): ShadowAtomConfig =>
	ShadowAtomConfigSchema.parse({ endpointUrl, orgs: registered(orgIds) });

/** The shadow config as herald's edge-config store serves it: a value, and listeners told of each new one. */
const createShadowStore = (initial: ShadowAtomConfig) => {
	let config = initial;
	const listeners = new Set<(next: ShadowAtomConfig) => void>();
	return {
		get: () => config,
		subscribe: (listener: (next: ShadowAtomConfig) => void) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		set: (next: ShadowAtomConfig) => {
			config = next;
			for (const listener of [...listeners]) listener(next);
		},
		listenerCount: () => listeners.size,
	};
};

const createHarness = ({ initial }: { initial: ShadowAtomConfig }) => {
	const store = createShadowStore(initial);
	const pushed: string[] = [];
	const failures: unknown[] = [];
	const shadowPush = createShadowAtomCatalogPush({
		ctx: {
			shadowAtomConfig: store,
			pushCatalog: async ({ orgId, env }) => {
				pushed.push(`${orgId}:${env}`);
			},
			logger: {
				warn: (meta: unknown) => failures.push(meta),
				error: (meta: unknown) => failures.push(meta),
			},
		},
	});
	return { store, pushed, failures, shadowPush };
};

test("start pushes every shadowed org's catalog, in both envs", async () => {
	const { pushed, shadowPush } = createHarness({
		initial: shadowWith({ orgIds: ["org_a", "org_b"] }),
	});
	await shadowPush.start();
	expect(pushed.sort()).toEqual([
		"org_a:live",
		"org_a:sandbox",
		"org_b:live",
		"org_b:sandbox",
	]);
	shadowPush.stop();
});

test("an org added to the shadow config is pushed once; orgs already there are not pushed again", async () => {
	const { store, pushed, shadowPush } = createHarness({
		initial: shadowWith({ orgIds: ["org_a"] }),
	});
	await shadowPush.start();
	pushed.length = 0;

	store.set(shadowWith({ orgIds: ["org_a", "org_b"] }));
	await shadowPush.settled();
	expect(pushed.sort()).toEqual(["org_b:live", "org_b:sandbox"]);

	pushed.length = 0;
	store.set({
		...shadowWith({ orgIds: ["org_a", "org_b"] }),
		pushTransport: "queue",
	});
	await shadowPush.settled();
	expect(pushed).toEqual([]);
	shadowPush.stop();
});

test("a shadow Atom that gains an address takes every registered org's catalog", async () => {
	const { store, pushed, shadowPush } = createHarness({
		initial: shadowWith({ orgIds: ["org_a"], endpointUrl: null }),
	});
	await shadowPush.start();
	expect(pushed).toEqual([]);

	store.set(shadowWith({ orgIds: ["org_a"] }));
	await shadowPush.settled();
	expect(pushed.sort()).toEqual(["org_a:live", "org_a:sandbox"]);
	shadowPush.stop();
});

test("a failed push is logged and does not stop the others; stop unsubscribes", async () => {
	const store = createShadowStore(shadowWith({ orgIds: ["org_a", "org_b"] }));
	const pushed: string[] = [];
	const failures: unknown[] = [];
	const shadowPush = createShadowAtomCatalogPush({
		ctx: {
			shadowAtomConfig: store,
			pushCatalog: async ({ orgId, env }) => {
				if (orgId === "org_a") throw new Error("Atom down");
				pushed.push(`${orgId}:${env}`);
			},
			logger: { warn: (meta: unknown) => failures.push(meta), error() {} },
		},
	});
	await shadowPush.start();
	expect(pushed.sort()).toEqual(["org_b:live", "org_b:sandbox"]);
	expect(failures).toHaveLength(2);

	shadowPush.stop();
	expect(store.listenerCount()).toBe(0);
});
