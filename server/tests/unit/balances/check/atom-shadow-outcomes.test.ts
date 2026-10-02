import { afterAll, beforeAll, expect, test } from "bun:test";
import {
	ApiVersion,
	ApiVersionClass,
	AppEnv,
	type CheckParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { runAtomShadowCheck } from "@/internal/balances/check/atomShadow/runAtomShadowCheck.js";
import { _setShadowAtomConfigForTesting } from "@/internal/misc/shadowAtom/shadowAtomConfigStore.js";
import { encryptData } from "@/utils/encryptUtils.js";

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

/** What the fake Atom does with the next check, and what it was sent. */
const atom = {
	reply: (): Response | Promise<Response> => Response.json({}),
	received: [] as { url: string; headers: Headers; body: unknown }[],
};

const server = Bun.serve({
	port: 0,
	fetch: async (request) => {
		atom.received.push({
			url: request.url,
			headers: request.headers,
			body: await request.json(),
		});
		return atom.reply();
	},
});

afterAll(() => {
	server.stop(true);
	restoreEnv({ key: "ENCRYPTION_PASSWORD", value: previousPassword });
	_setShadowAtomConfigForTesting({ config: {} });
});

const apiResponse = {
	allowed: true,
	customer_id: "cus_1",
	balance: { feature_id: "messages", remaining: 9 },
	preview: undefined,
};
const params: CheckParams = { customer_id: "cus_1", feature_id: "messages" };

const createCtx = () => {
	const logs: Record<string, unknown>[] = [];
	const log = (_message: string, meta: Record<string, unknown>) => {
		logs.push(meta);
	};
	const ctx = {
		org: { id: "org_shadow" },
		env: AppEnv.Sandbox,
		apiVersion: new ApiVersionClass(ApiVersion.V2_3),
		skipCache: false,
		logger: { info: log, warn: log, error: log, debug: log },
	} as unknown as AutumnContext;
	return { ctx, logs };
};

const shadow = (ctx: AutumnContext) =>
	runAtomShadowCheck({
		ctx,
		params,
		search: "?expand=balance.feature",
		apiResponse,
	});

beforeAll(() => {
	process.env.ENCRYPTION_PASSWORD = "atom-shadow-test-password";
	_setShadowAtomConfigForTesting({
		config: {
			endpointUrl: server.url.origin,
			orgs: {
				org_shadow: {
					encryptedTokens: {
						sandbox: encryptData("shadow_token_1"),
						live: encryptData("shadow_token_live"),
					},
					registeredAt: 1,
					percent: 100,
					previousPercent: 100,
				},
			},
		},
	});
	atom.received.length = 0;
});

test("the shadow Atom gets the caller's check with its token, version and query; the same answer is a match", async () => {
	atom.reply = () =>
		Response.json({
			customer_id: "cus_1",
			balance: { remaining: 9, feature_id: "messages" },
			allowed: true,
		});
	const { ctx, logs } = createCtx();
	await shadow(ctx);

	const sent = atom.received.at(-1);
	expect(sent?.url).toBe(
		`${server.url.origin}/v1/balances.check?expand=balance.feature`,
	);
	expect(sent?.headers.get("x-atom-token")).toBe("shadow_token_1");
	expect(sent?.headers.get("x-api-version")).toBe(ApiVersion.V2_3);
	expect(sent?.body).toEqual(params);
	expect(logs).toHaveLength(1);
	expect(logs[0]).toMatchObject({
		type: "atom_shadow_check",
		org_id: "org_shadow",
		env: AppEnv.Sandbox,
		customer_id: "cus_1",
		entity_id: null,
		status: "match",
	});
	expect(logs[0].latency_ms).toBeNumber();
	expect(logs[0]).not.toHaveProperty("api_response");
});

test("a different answer is a mismatch and logs both bodies", async () => {
	const atomResponse = { allowed: false, customer_id: "cus_1", balance: null };
	atom.reply = () => Response.json(atomResponse);
	const { ctx, logs } = createCtx();
	await shadow(ctx);

	expect(logs[0]).toMatchObject({
		status: "mismatch",
		api_response: {
			allowed: true,
			customer_id: "cus_1",
			balance: { feature_id: "messages", remaining: 9 },
		},
		atom_response: atomResponse,
	});
});

test("an Atom slower than 300ms is a timeout", async () => {
	atom.reply = async () => {
		await Bun.sleep(3_000);
		return Response.json(apiResponse);
	};
	const { ctx, logs } = createCtx();
	await shadow(ctx);

	expect(logs[0]).toMatchObject({ status: "timeout" });
	expect(logs[0].latency_ms as number).toBeLessThan(2_000);
});

test("an Atom that refuses the check is an atom_error, never an error-level line", async () => {
	atom.reply = () =>
		new Response("{}", {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	const { ctx, logs } = createCtx();
	const errors: unknown[] = [];
	ctx.logger.error = (...args: unknown[]) => errors.push(args);
	await shadow(ctx);

	expect(logs[0]).toMatchObject({ status: "atom_error", reason: "http_500" });
	expect(errors).toHaveLength(0);
});
