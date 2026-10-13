/**
 * Staging's shadow Atom holds its tokens in the shadow config, not atom_deployments: its token hash still opens
 * /atom/*, as the folder of the org and env it was registered for; an unknown hash, or any hash outside staging, is 401.
 */

import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import type { TrackCommand } from "@autumn/balance-engine";
import {
	ATOM_TOKEN_HASH_HEADER,
	ATOM_TRACKS_APPEND_PATH,
	AtomTracksAppendErrorCode,
} from "@autumn/byoc";
import { AppEnv } from "@autumn/shared";
import { Hono } from "hono";
import * as balanceWorkerClient from "@/external/balanceWorker/getBalanceWorkerClient.js";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { atomRouter } from "@/internal/byoc/atomRouter.js";
import { cacheDeploymentRepo } from "@/internal/byoc/repos/cacheDeploymentRepo.js";
import { atomTokenToHash } from "@/internal/byoc/utils/atomTokenUtils.js";
import { _setShadowAtomConfigForTesting } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { _setShadowAtomCutOffForTesting } from "@/internal/misc/shadowAtom/shadowAtomCutOffStore.js";
import { encryptData } from "@/utils/encryptUtils.js";
import { createTrackCommand } from "../../../../packages/balance-engine/tests/unit/engineFixtures.js";

const ORG_ID = "org_shadow";
const LIVE_TOKEN = "atom_shadow_live_token";
const TEST_ENV = {
	STAGING_ENVIRONMENT: "true",
	AWS_REGION: "us-east-1",
	ENCRYPTION_PASSWORD: "shadow-token-hash-test-password",
};
const previousEnv = Object.fromEntries(
	Object.keys(TEST_ENV).map((key) => [key, process.env[key]]),
);
const setEnv = (vars: Record<string, string | undefined>) => {
	for (const [key, value] of Object.entries(vars)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
};

let queued: TrackCommand[][] = [];
const spies: { mockRestore(): void }[] = [];
beforeAll(() => {
	setEnv(TEST_ENV);
	_setShadowAtomConfigForTesting({
		config: {
			endpointUrl: "https://shadow.example",
			orgs: {
				[ORG_ID]: {
					encryptedTokens: {
						sandbox: encryptData("atom_shadow_sandbox_token"),
						live: encryptData(LIVE_TOKEN),
					},
					registeredAt: 1,
					percent: 100,
					previousPercent: 100,
				},
			},
		},
	});
	spies.push(
		spyOn(cacheDeploymentRepo, "findByTokenHash").mockResolvedValue(null),
		spyOn(balanceWorkerClient, "getBalanceWorkerClient").mockReturnValue({
			queue: {
				track: async ({ commands }: { commands: TrackCommand[] }) => {
					queued.push(commands);
				},
			},
		} as never),
	);
});
afterEach(() => {
	queued = [];
	setEnv(TEST_ENV);
	_setShadowAtomCutOffForTesting({ until: null });
});
afterAll(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
	setEnv(previousEnv);
	_setShadowAtomConfigForTesting({ config: {} });
});

const logger = { info: () => {} };
const app = new Hono<HonoEnv>();
app.use("*", async (c, next) => {
	c.set("ctx", { db: {}, id: "req_shadow", logger } as never);
	await next();
});
app.route("/atom", atomRouter);

/** A hand-in from the shadow's live folder of the registered org. */
const appendAs = ({ tokenHash }: { tokenHash: string }) => {
	const command = createTrackCommand({ commandId: "atom_req_1" });
	return app.request(ATOM_TRACKS_APPEND_PATH, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			[ATOM_TOKEN_HASH_HEADER]: tokenHash,
		},
		body: JSON.stringify({
			writer: "w_1",
			tracks: [
				{
					seq: 1,
					command: {
						...command,
						identity: { ...command.identity, orgId: ORG_ID, env: AppEnv.Live },
					},
				},
			],
		}),
	});
};

test("a known shadow token resolves to the shadow Atom's folder for its org and env", async () => {
	const reply = await appendAs({
		tokenHash: atomTokenToHash({ token: LIVE_TOKEN }),
	});

	expect(reply.status).toBe(204);
	expect(queued[0][0].source).toEqual({
		atomId: `${ORG_ID}.${AppEnv.Live}`,
		writerId: "w_1",
		seq: 1,
	});
});

test("an unknown token is still 401 atom_unknown", async () => {
	const reply = await appendAs({
		tokenHash: atomTokenToHash({ token: "atom_not_registered" }),
	});

	expect(reply.status).toBe(401);
	expect(await reply.json()).toMatchObject({
		code: AtomTracksAppendErrorCode.AtomUnknown,
	});
	expect(queued).toEqual([]);
});

test("outside staging the shadow config is never consulted", async () => {
	for (const outside of [
		{ STAGING_ENVIRONMENT: undefined },
		{ AWS_REGION: "us-east-2" },
	]) {
		setEnv({ ...TEST_ENV, ...outside });
		const reply = await appendAs({
			tokenHash: atomTokenToHash({ token: LIVE_TOKEN }),
		});
		expect(reply.status).toBe(401);
	}
	expect(queued).toEqual([]);
});

test("while the cut-off window is open the shadow gets 503, and once it closes its hand-in lands", async () => {
	const tokenHash = atomTokenToHash({ token: LIVE_TOKEN });
	_setShadowAtomCutOffForTesting({ until: Date.now() + 60_000 });
	const cut = await appendAs({ tokenHash });
	expect(cut.status).toBe(503);
	expect(await cut.json()).toMatchObject({ code: "atom_shadow_cut_off" });
	expect(queued).toEqual([]);

	_setShadowAtomCutOffForTesting({ until: Date.now() - 1 });
	expect((await appendAs({ tokenHash })).status).toBe(204);
});
