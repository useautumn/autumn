import { afterAll, afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { ApiVersionClass, AppEnv, LATEST_VERSION } from "@autumn/shared";
import { Hono } from "hono";
import type { AutumnContext, HonoEnv } from "@/honoUtils/HonoEnv.js";
import type { CheckResponseWithPreview } from "@/internal/api/check/getCheckPreview.js";
import { handleCheck } from "@/internal/api/check/handleCheck.js";
import * as balanceWorkerCheck from "@/internal/balances/check/balanceWorker/runBalanceWorkerCheck.js";
import { _setShadowAtomConfigForTesting } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

// The worker lane answers the real check here; the shadow runs the same after either lane.
const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
const previousPassword = process.env.ENCRYPTION_PASSWORD;
/** Puts an env var back as it was, unset included. */
const restoreEnv = ({
	key,
	value,
}: {
	key: string;
	value: string | undefined;
}) => {
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
};

beforeAll(() => {
	process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
	process.env.ENCRYPTION_PASSWORD = "atom-shadow-test-password";
});

/** Our shadow Atom at `endpointUrl`, holding half of the test org's customers once the org is registered on it. */
const useShadowAtom = ({
	endpointUrl,
	registered = true,
}: {
	endpointUrl: string;
	registered?: boolean;
}) =>
	_setShadowAtomConfigForTesting({
		config: {
			sandbox: {
				endpointUrl,
				orgs: registered
					? {
							org_shadow: {
								encryptedToken: encryptData("shadow_token_1"),
								registeredAt: 1,
							},
						}
					: {},
				rollout: { orgs: { org_shadow: 50 } },
			},
		},
	});

const checkResponse = {
	allowed: true,
	customer_id: "cus_x",
	balance: null,
	flag: null,
} as unknown as CheckResponseWithPreview;

const balanceWorkerCheckSpy = spyOn(
	balanceWorkerCheck,
	"runBalanceWorkerCheck",
).mockImplementation(async () => checkResponse);

/** A fake Atom that answers with the API's own response once `gate` resolves. */
const atom = { gate: Promise.resolve(), calls: 0 };
const server = Bun.serve({
	port: 0,
	fetch: async () => {
		atom.calls++;
		await atom.gate;
		return Response.json(checkResponse);
	},
});

afterEach(() => {
	atom.gate = Promise.resolve();
	atom.calls = 0;
});

afterAll(() => {
	server.stop(true);
	balanceWorkerCheckSpy.mockRestore();
	restoreEnv({ key: "BALANCE_WORKER_ROLLOUT_ENABLED", value: previousRollout });
	restoreEnv({ key: "ENCRYPTION_PASSWORD", value: previousPassword });
	_setShadowAtomConfigForTesting({ config: {} });
});

const customerIds = Array.from({ length: 200 }, (_, i) => `cus_${i}`);
const bucketOf = (customerId: string) =>
	Number(BigInt(Bun.hash(customerId)) % 100n);
const inside = customerIds.find((customerId) => bucketOf(customerId) < 50);
const outside = customerIds.find((customerId) => bucketOf(customerId) >= 50);
if (!inside || !outside)
	throw new Error("The sample ids must fall on both sides of a 50% rollout");

/** A request from an org with no Atom of its own: the shadow check needs none. */
const createCtx = () => {
	const shadowLogs: Record<string, unknown>[] = [];
	const ignore = () => {};
	const ctx = {
		id: "req_atom_shadow",
		timestamp: Date.now(),
		org: { id: "org_shadow", slug: "shadow", config: {} },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(LATEST_VERSION),
		features: [],
		extraLogs: {},
		scopes: [],
		expand: [],
		skipCache: false,
		logger: {
			info: (_message: string, meta: Record<string, unknown>) => {
				if (meta?.type === "atom_shadow_check") shadowLogs.push(meta);
			},
			warn: ignore,
			error: ignore,
			debug: ignore,
		},
	} as unknown as AutumnContext;
	return { ctx, shadowLogs };
};

const postCheck = async ({
	ctx,
	body,
}: {
	ctx: AutumnContext;
	body: Record<string, unknown>;
}) => {
	const app = new Hono<HonoEnv>();
	app.use("*", async (c, next) => {
		c.set("ctx", ctx);
		await next();
	});
	app.post("/check", ...handleCheck);
	return app.request("/check", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
};

const waitForShadowLog = async (logs: Record<string, unknown>[]) => {
	for (let waited = 0; logs.length === 0 && waited < 1_000; waited += 10)
		await Bun.sleep(10);
	return logs[0];
};

test("the caller's check answers while the shadow Atom has not", async () => {
	const { promise: atomHeld, resolve: releaseAtom } =
		Promise.withResolvers<void>();
	atom.gate = atomHeld;
	useShadowAtom({ endpointUrl: server.url.origin });
	const { ctx, shadowLogs } = createCtx();
	const response = await postCheck({
		ctx,
		body: { customer_id: inside, feature_id: "messages" },
	});

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(checkResponse);
	expect(shadowLogs).toHaveLength(0);
	releaseAtom();
	expect(await waitForShadowLog(shadowLogs)).toMatchObject({
		status: "match",
		customer_id: inside,
	});
});

test("a shadow Atom that is down leaves the check untouched and logs atom_error", async () => {
	const down = Bun.serve({ port: 0, fetch: () => new Response() });
	const endpointUrl = down.url.origin;
	down.stop(true);
	useShadowAtom({ endpointUrl });
	const { ctx, shadowLogs } = createCtx();
	const response = await postCheck({
		ctx,
		body: { customer_id: inside, feature_id: "messages" },
	});

	expect(response.status).toBe(200);
	expect(await response.json()).toEqual(checkResponse);
	expect(await waitForShadowLog(shadowLogs)).toMatchObject({
		status: "atom_error",
	});
});

test("a customer outside the rollout, or a check Atom would hand back, never reaches the shadow Atom", async () => {
	useShadowAtom({ endpointUrl: server.url.origin });
	const { ctx, shadowLogs } = createCtx();
	await postCheck({
		ctx,
		body: { customer_id: outside, feature_id: "messages" },
	});
	await postCheck({
		ctx,
		body: { customer_id: inside, feature_id: "messages", send_event: true },
	});
	await Bun.sleep(50);

	expect(atom.calls).toBe(0);
	expect(shadowLogs).toHaveLength(0);
});

test("an org not registered on the shadow Atom never reaches it", async () => {
	useShadowAtom({ endpointUrl: server.url.origin, registered: false });
	const { ctx, shadowLogs } = createCtx();
	const response = await postCheck({
		ctx,
		body: { customer_id: inside, feature_id: "messages" },
	});
	await Bun.sleep(50);

	expect(response.status).toBe(200);
	expect(atom.calls).toBe(0);
	expect(shadowLogs).toHaveLength(0);
});
