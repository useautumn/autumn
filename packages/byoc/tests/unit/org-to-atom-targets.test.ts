import { describe, expect, test } from "bun:test";
import { ShadowAtomConfigSchema } from "@autumn/edge-config";
import { AppEnv, type Organization } from "@autumn/shared";
import { orgToAtomTargets } from "../../src/subjects/orgToAtomTargets.js";

const org = { id: "org_1" } as Organization;

const queuedShadowAtom = (externalId: string | null) =>
	ShadowAtomConfigSchema.parse({
		endpointUrl: "https://shadow-atom.example.com",
		pushTransport: "queue",
		externalId,
		orgs: {
			org_1: {
				encryptedTokens: { sandbox: "enc_sandbox", live: "enc_live" },
				registeredAt: 1,
				percent: 100,
			},
		},
	});

describe("pushes to our shadow Atom's queue", () => {
	test("go to the current shadow Atom's deployment group", () => {
		const [target] = orgToAtomTargets({
			shadowAtomConfig: queuedShadowAtom(
				"autumn-internal-shadow-atom.atom_0123456789abcdef01234567",
			),
			org,
			env: AppEnv.Sandbox,
		});
		expect(target?.queue).toEqual({
			externalId: "autumn-internal-shadow-atom.atom_0123456789abcdef01234567",
			atomId: "org_1.sandbox",
		});
	});

	test("a file from before shadow Atoms were named apart keeps the one fixed group", () => {
		const [target] = orgToAtomTargets({
			shadowAtomConfig: queuedShadowAtom(null),
			org,
			env: AppEnv.Live,
		});
		expect(target?.queue?.externalId).toBe("autumn-internal-shadow-atom");
	});
});

const orgWithAtom = {
	id: "org_1",
	atomDeployments: [
		{
			id: "atom_0123456789abcdef01234567",
			status: "ready",
			deployment_id: "dep_1",
			endpoint_url: "https://atom.example.com",
			encrypted_token: "enc_token",
		},
	],
} as Organization;

const noShadowAtom = ShadowAtomConfigSchema.parse({});

describe("pushes to an org's own Atom", () => {
	test("over the queue, they go to the deployment group its setup started, with no folder", () => {
		const [target] = orgToAtomTargets({
			shadowAtomConfig: noShadowAtom,
			org: orgWithAtom,
			env: AppEnv.Live,
			orgAtomsOverQueue: true,
		});
		expect(target).toEqual({
			target: "org",
			id: "atom_0123456789abcdef01234567",
			endpointUrl: "https://atom.example.com",
			encryptedToken: "enc_token",
			queue: {
				externalId: "org_1.live.atom_0123456789abcdef01234567",
				atomId: null,
			},
		});
	});

	test("otherwise they go over HTTP", () => {
		const [target] = orgToAtomTargets({
			shadowAtomConfig: noShadowAtom,
			org: orgWithAtom,
			env: AppEnv.Live,
		});
		expect(target?.queue).toBeNull();
	});
});
