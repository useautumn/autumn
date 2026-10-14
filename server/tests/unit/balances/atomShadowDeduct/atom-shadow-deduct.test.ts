import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	ErrCode,
	FeatureType,
	LATEST_VERSION,
	RecaseError,
} from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { CheckResponseWithPreview } from "@/internal/api/check/getCheckPreview.js";
import { handleCheck } from "@/internal/api/check/handleCheck.js";
import { atomShadowDeductOrgIds } from "@/internal/balances/atomShadowDeduct/atomShadowDeductGuards.js";
import * as balanceWorkerCheck from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import * as finalizeLock from "@/internal/balances/finalizeLock/runFinalizeLock.js";
import { handleFinalizeLock } from "@/internal/balances/handlers/handleFinalizeLock.js";
import { handleTrack } from "@/internal/balances/handlers/handleTrack.js";
import * as balanceWorkerTrack from "@/internal/balances/track/balanceWorker/trackOnBalanceWorker.js";
import * as idempotencyClaim from "@/internal/misc/idempotency/actions/checkIdempotencyKey.js";
import { _setShadowAtomConfigForTesting } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

const ORG_ID = "org_deduct";
const STAGING_ENV = {
	STAGING_ENVIRONMENT: "true",
	AWS_REGION: "us-east-1",
	ATOM_SHADOW_DEDUCT_ORG_IDS: ` org_other, ${ORG_ID} `,
};
const TEST_ENV = {
	...STAGING_ENV,
	BALANCE_WORKER_ROLLOUT_ENABLED: "true",
	ENCRYPTION_PASSWORD: "atom-shadow-deduct-test-password",
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

beforeAll(() => setEnv(TEST_ENV));

const workerAnswer = {
	allowed: true,
	customer_id: "cus_1",
	balance: null,
	flag: null,
	from: "worker",
} as unknown as CheckResponseWithPreview;
const atomAnswer = { allowed: true, customer_id: "cus_1", from: "atom" };
const atomTrackAnswer = { customer_id: "cus_1", value: 2, balance: null };
const apiFinalizeAnswer = { success: true, from: "api" };

const workerCheckSpy = spyOn(
	balanceWorkerCheck,
	"runBalanceWorkerCheck",
).mockImplementation(async () => workerAnswer);
const workerTrackSpy = spyOn(
	balanceWorkerTrack,
	"trackOnBalanceWorker",
).mockImplementation(async ({ body }) => ({
	result: { customer_id: body.customer_id, value: 1, balance: null },
	status: 202,
}));

const finalizeSpy = spyOn(finalizeLock, "runFinalizeLock").mockImplementation(
	async () => apiFinalizeAnswer as never,
);

/** Every key the API claimed, as its idempotency store would see it. */
const claimedKeys: string[] = [];
const claimSpy = spyOn(
	idempotencyClaim,
	"checkIdempotencyKey",
).mockImplementation(async ({ idempotencyKey }) => {
	claimedKeys.push(idempotencyKey);
});

/** A fake shadow Atom: answers with `reply`, and records what it was sent. */
const answerAsAtom = (path: string): Response => {
	if (path === "/v1/track")
		return Response.json(atomTrackAnswer, { status: 202 });
	if (path === "/v1/balances.finalize") return Response.json({ success: true });
	return Response.json(atomAnswer);
};
const atom = {
	reply: answerAsAtom,
	calls: [] as {
		path: string;
		headers: Headers;
		body: Record<string, unknown>;
	}[],
};
const server = Bun.serve({
	port: 0,
	fetch: async (request) => {
		const { pathname } = new URL(request.url);
		atom.calls.push({
			path: pathname,
			headers: request.headers,
			body: (await request.json()) as Record<string, unknown>,
		});
		return atom.reply(pathname);
	},
});

/** The org registered on our shadow Atom for every customer. */
const useShadowAtom = ({
	endpointUrl = server.url.origin,
}: {
	endpointUrl?: string;
} = {}) =>
	_setShadowAtomConfigForTesting({
		config: {
			endpointUrl,
			orgs: {
				[ORG_ID]: {
					encryptedTokens: {
						sandbox: encryptData("shadow_token_sandbox"),
						live: encryptData("shadow_token_live"),
					},
					registeredAt: 1,
					percent: 100,
					previousPercent: 100,
				},
			},
		},
	});

afterEach(() => {
	atom.reply = answerAsAtom;
	atom.calls = [];
	workerCheckSpy.mockClear();
	workerTrackSpy.mockClear();
	finalizeSpy.mockClear();
	claimedKeys.length = 0;
	setEnv(TEST_ENV);
});

afterAll(() => {
	server.stop(true);
	workerCheckSpy.mockRestore();
	workerTrackSpy.mockRestore();
	finalizeSpy.mockRestore();
	claimSpy.mockRestore();
	setEnv(previousEnv);
	_setShadowAtomConfigForTesting({ config: {} });
});

const createCtx = ({
	orgId = ORG_ID,
	apiVersion = LATEST_VERSION,
}: {
	orgId?: string;
	apiVersion?: ApiVersion;
} = {}) => {
	const deductLogs: Record<string, unknown>[] = [];
	const ignore = () => {};
	const ctx = {
		id: "req_1",
		timestamp: Date.now(),
		org: { id: orgId, slug: "deduct", config: {} },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(apiVersion),
		features: [
			{ id: "emails", internal_id: "fe_emails", type: FeatureType.Metered },
		],
		extraLogs: {},
		scopes: [],
		expand: [],
		skipCache: false,
		logger: {
			info: (_message: string, meta: Record<string, unknown>) => {
				if (meta?.type === "atom_shadow_deduct") deductLogs.push(meta);
			},
			warn: ignore,
			error: ignore,
			debug: ignore,
		},
	} as unknown as AutumnContext;
	return { ctx, deductLogs };
};

const post = async ({
	ctx,
	route,
	body,
	headers = {},
}: {
	ctx: AutumnContext;
	route: "check" | "track" | "finalize";
	body: Record<string, unknown>;
	headers?: Record<string, string>;
}) => {
	const app = new Hono<HonoEnv>();
	app.onError((error, c) =>
		error instanceof RecaseError
			? c.json({ code: error.code }, error.statusCode as 409)
			: c.json({ code: "internal_error" }, 500),
	);
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/check", ...handleCheck);
	app.post("/track", ...handleTrack);
	app.post("/finalize", ...handleFinalizeLock);
	return app.request(`/${route}`, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: JSON.stringify(body),
	});
};

const deductingCheck = {
	customer_id: "cus_1",
	feature_id: "emails",
	send_event: true,
};
const queuedTrack = { customer_id: "cus_1", feature_id: "emails", value: 2 };
const lockCheck = {
	customer_id: "cus_1",
	feature_id: "emails",
	required_balance: 30,
	lock: { enabled: true, lock_id: "lock_1" },
};
const finalize = { customer_id: "cus_1", lock_id: "lock_1", action: "release" };

/** Atom's keyless handback for a call it leaves to the API, with the reason it names. */
const handBack = (reason: string) => () =>
	Response.json(
		{ code: "atom_not_forwarded" },
		{ status: 401, headers: { "x-atom-forwarded": reason } },
	);

describe("the flag", () => {
	test("names its orgs on staging", () => {
		expect([...atomShadowDeductOrgIds({ runtimeEnv: STAGING_ENV })]).toEqual([
			"org_other",
			ORG_ID,
		]);
	});

	test("never activates outside staging, whatever it says", () => {
		for (const runtimeEnv of [
			{ ...STAGING_ENV, STAGING_ENVIRONMENT: undefined },
			{ ...STAGING_ENV, NODE_ENV: "production", STAGING_ENVIRONMENT: "false" },
			{ ...STAGING_ENV, AWS_REGION: "us-east-2" },
		])
			expect(atomShadowDeductOrgIds({ runtimeEnv }).size).toBe(0);
	});

	test("in a production region, an allowlisted org's deductions never reach Atom", async () => {
		setEnv({ AWS_REGION: "us-east-2" });
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		await post({ ctx, route: "check", body: deductingCheck });
		await post({ ctx, route: "track", body: queuedTrack });

		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
		expect(workerCheckSpy).toHaveBeenCalledTimes(1);
		expect(workerTrackSpy).toHaveBeenCalledTimes(1);
	});
});

describe("a deducting check", () => {
	test("from an allowlisted org is Atom's to answer, with no deduction on the API", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: deductingCheck });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(atomAnswer);
		expect(workerCheckSpy).not.toHaveBeenCalled();
		expect(atom.calls).toHaveLength(1);
		const [{ path, headers, body }] = atom.calls;
		expect(path).toBe("/v1/balances.check");
		expect(headers.get("x-atom-token")).toBe("shadow_token_sandbox");
		expect(headers.get("authorization")).toBeNull();
		expect(headers.get("idempotency-key")).toBe("atom_shadow_req_1");
		expect(body).toEqual(deductingCheck);
		expect(deductLogs).toEqual([
			expect.objectContaining({
				route: "check",
				atom_reply: "answered",
				answered_by: "atom",
				status: 200,
				allowed: true,
				key_minted: true,
			}),
		]);
	});

	test("Atom hands back runs on the API, which claims the key Atom was sent", async () => {
		atom.reply = () =>
			Response.json(
				{ code: "atom_not_forwarded" },
				{ status: 401, headers: { "x-atom-forwarded": "journal_backlog" } },
			);
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: deductingCheck });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(workerAnswer);
		expect(atom.calls[0].headers.get("idempotency-key")).toBe(
			"atom_shadow_req_1",
		);
		expect(claimedKeys).toEqual(["atom_shadow_req_1"]);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "forwarded",
			atom_reason: "journal_backlog",
			answered_by: "api",
		});
	});

	test("Atom down falls back to the API under the minted key", async () => {
		atom.reply = () =>
			Response.json({ code: "atom_unavailable" }, { status: 503 });
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: deductingCheck });

		expect(await response.json()).toEqual(workerAnswer);
		expect(workerCheckSpy).toHaveBeenCalledTimes(1);
		expect(claimedKeys).toEqual(["atom_shadow_req_1"]);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "down",
			atom_reason: "http_503",
		});
	});

	test("one carrying the client's own key stays on the API: its middleware already claimed it", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({
			ctx,
			route: "check",
			body: deductingCheck,
			headers: { "idempotency-key": "client_key" },
		});

		expect(await response.json()).toEqual(workerAnswer);
		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
	});

	test("from an org not allowlisted is unchanged", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx({ orgId: "org_unlisted" });
		const response = await post({ ctx, route: "check", body: deductingCheck });

		expect(await response.json()).toEqual(workerAnswer);
		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
		expect(claimedKeys).toEqual([]);
	});

	test("a plain check is the API's, mirrored to Atom only afterwards", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({
			ctx,
			route: "check",
			body: { customer_id: "cus_1", feature_id: "emails" },
		});
		expect(await response.json()).toEqual(workerAnswer);
		for (
			let waited = 0;
			atom.calls.length === 0 && waited < 1_000;
			waited += 10
		)
			await Bun.sleep(10);

		expect(workerCheckSpy).toHaveBeenCalledTimes(1);
		expect(deductLogs).toHaveLength(0);
		// The atom_shadow_check mirror: keyless, after the API answered.
		expect(atom.calls).toHaveLength(1);
		expect(atom.calls[0].headers.get("idempotency-key")).toBeNull();
	});
});

describe("a track", () => {
	test("from an allowlisted org is Atom's to answer, with no deduction on the API", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "track", body: queuedTrack });

		expect(response.status).toBe(202);
		expect(await response.json()).toEqual(atomTrackAnswer);
		expect(workerTrackSpy).not.toHaveBeenCalled();
		const [{ path, body }] = atom.calls;
		expect(path).toBe("/v1/track");
		expect(body).toMatchObject({
			...queuedTrack,
			idempotency_key: "atom_shadow_req_1",
		});
		expect(deductLogs[0]).toMatchObject({
			route: "track",
			answered_by: "atom",
			status: 202,
			allowed: true,
		});
	});

	test("Atom hands back runs on the API under the same key", async () => {
		atom.reply = () =>
			Response.json(
				{ code: "atom_not_forwarded" },
				{ status: 401, headers: { "x-atom-forwarded": "track_denied" } },
			);
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({
			ctx,
			route: "track",
			body: { ...queuedTrack, idempotency_key: "body_key" },
		});

		expect(response.status).toBe(202);
		expect(atom.calls[0].body.idempotency_key).toBe("body_key");
		expect(workerTrackSpy.mock.calls[0][0].body.idempotency_key).toBe(
			"body_key",
		);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "forwarded",
			atom_reason: "track_denied",
			answered_by: "api",
			allowed: null,
		});
	});

	test("Atom's keyless handback without its header (a replica hop drops it) still runs on the API", async () => {
		atom.reply = () =>
			Response.json({ code: "atom_not_forwarded" }, { status: 401 });
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "track", body: queuedTrack });

		expect(response.status).toBe(202);
		expect(workerTrackSpy).toHaveBeenCalledTimes(1);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "forwarded",
			atom_reason: "atom_not_forwarded",
			answered_by: "api",
		});
	});

	test("Atom unreachable falls back to the API under the minted key", async () => {
		const down = Bun.serve({ port: 0, fetch: () => new Response() });
		const endpointUrl = down.url.origin;
		down.stop(true);
		useShadowAtom({ endpointUrl });
		const { ctx, deductLogs } = createCtx();
		await post({ ctx, route: "track", body: queuedTrack });

		expect(workerTrackSpy.mock.calls[0][0].body.idempotency_key).toBe(
			"atom_shadow_req_1",
		);
		expect(deductLogs[0]).toMatchObject({ atom_reply: "down" });
	});

	test("a fallback whose key Atom's hand-in already claimed is a duplicate, logged apart from errors", async () => {
		atom.reply = () =>
			Response.json({ code: "atom_unavailable" }, { status: 503 });
		workerTrackSpy.mockImplementationOnce(async () => {
			throw new RecaseError({
				message: "duplicate",
				code: ErrCode.DuplicateIdempotencyKey,
				statusCode: 409,
			});
		});
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "track", body: queuedTrack });

		expect(response.status).toBe(409);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "down",
			answered_by: "api",
			status: null,
			api_error: ErrCode.DuplicateIdempotencyKey,
			fallback_duplicate: true,
		});
	});

	test("from an org not allowlisted is unchanged", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx({ orgId: "org_unlisted" });
		await post({ ctx, route: "track", body: queuedTrack });

		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
		expect(workerTrackSpy).toHaveBeenCalledTimes(1);
		expect(
			workerTrackSpy.mock.calls[0][0].body.idempotency_key,
		).toBeUndefined();
	});
});

describe("a lock check", () => {
	test("from an allowlisted org is Atom's to answer, with no lock taken on the API", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: lockCheck });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(atomAnswer);
		expect(workerCheckSpy).not.toHaveBeenCalled();
		const [{ path, headers, body }] = atom.calls;
		expect(path).toBe("/v1/balances.check");
		expect(headers.get("idempotency-key")).toBe("atom_shadow_req_1");
		expect(body).toEqual(lockCheck);
		expect(deductLogs).toEqual([
			expect.objectContaining({
				route: "check",
				lock_id: "lock_1",
				value: 30,
				answered_by: "atom",
				allowed: true,
			}),
		]);
	});

	test("Atom hands back (an entity lock, or below 2.6) takes the lock on the API under the key Atom was sent", async () => {
		atom.reply = handBack("lock");
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: lockCheck });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(workerAnswer);
		expect(workerCheckSpy).toHaveBeenCalledTimes(1);
		expect(claimedKeys).toEqual(["atom_shadow_req_1"]);
		expect(deductLogs[0]).toMatchObject({
			atom_reply: "forwarded",
			atom_reason: "lock",
			answered_by: "api",
			lock_id: "lock_1",
		});
	});

	test("Atom down takes the lock on the API", async () => {
		atom.reply = () =>
			Response.json({ code: "atom_unavailable" }, { status: 503 });
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "check", body: lockCheck });

		expect(await response.json()).toEqual(workerAnswer);
		expect(workerCheckSpy).toHaveBeenCalledTimes(1);
		expect(deductLogs[0]).toMatchObject({ atom_reply: "down" });
	});

	test("from an org not allowlisted is unchanged", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx({ orgId: "org_unlisted" });
		const response = await post({ ctx, route: "check", body: lockCheck });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(workerAnswer);
		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
		expect(claimedKeys).toEqual([]);
	});
});

describe("a finalize", () => {
	test("at 2.6 from an allowlisted org is Atom's to settle, with nothing settled on the API", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "finalize", body: finalize });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ success: true });
		expect(finalizeSpy).not.toHaveBeenCalled();
		const [{ path, headers, body }] = atom.calls;
		expect(path).toBe("/v1/balances.finalize");
		expect(headers.get("x-api-version")).toBe(LATEST_VERSION);
		expect(body).toEqual(finalize);
		expect(deductLogs).toEqual([
			expect.objectContaining({
				route: "finalize",
				lock_id: "lock_1",
				feature_id: null,
				value: null,
				answered_by: "atom",
			}),
		]);
	});

	test("Atom hands back a lock it does not hold, and the API settles it", async () => {
		atom.reply = handBack("lock_not_held");
		useShadowAtom();
		const { ctx, deductLogs } = createCtx();
		const response = await post({ ctx, route: "finalize", body: finalize });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(apiFinalizeAnswer);
		expect(finalizeSpy).toHaveBeenCalledTimes(1);
		expect(deductLogs[0]).toMatchObject({
			route: "finalize",
			atom_reply: "forwarded",
			atom_reason: "lock_not_held",
			answered_by: "api",
		});
	});

	test("below 2.6 names no customer, so it stays on the API", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx({ apiVersion: ApiVersion.V2_5 });
		const response = await post({
			ctx,
			route: "finalize",
			body: { lock_id: "lock_1", action: "release" },
		});

		expect(await response.json()).toEqual(apiFinalizeAnswer);
		expect(finalizeSpy).toHaveBeenCalledTimes(1);
		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
	});

	test("from an org not allowlisted is unchanged", async () => {
		useShadowAtom();
		const { ctx, deductLogs } = createCtx({ orgId: "org_unlisted" });
		const response = await post({ ctx, route: "finalize", body: finalize });

		expect(await response.json()).toEqual(apiFinalizeAnswer);
		expect(atom.calls).toHaveLength(0);
		expect(deductLogs).toHaveLength(0);
	});
});
