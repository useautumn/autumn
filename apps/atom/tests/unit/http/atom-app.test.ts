import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LATEST_VERSION } from "@autumn/shared";
import {
	createCatalogFor,
	createCatalogRowsFor,
	createState,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createDevAuth } from "../../../src/dev/createDevAuth.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";
import { atomOrg } from "../utils/atomFixtures.js";

const ATOM_TOKEN = "atom_token_1";
const AUTUMN_API_URL = "https://api.autumn.example";
const SECRET_KEY = "Bearer am_sk_test_1";

const opened: Auth[] = [];
const directories: string[] = [];
const newDataDir = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-data-"));
	directories.push(dataDir);
	return dataDir;
};
const createLogger = () => {
	const logged: unknown[] = [];
	return {
		logged,
		logger: {
			info: () => undefined,
			warn: () => undefined,
			error: (...args: unknown[]) => void logged.push(args),
		},
	};
};

/** An Atom as an org's cloud runs it: ATOM_TOKEN opens its one data folder. */
const createDeployedApp = () => {
	const auth = createDeployedAuth({
		dataDir: newDataDir(),
		tokenHash: hashToken({ token: ATOM_TOKEN }),
		slotCount: 2,
	});
	opened.push(auth);
	const { logger, logged } = createLogger();
	return {
		app: createAtomApp({
			ctx: { auth, logger, autumnApiUrl: AUTUMN_API_URL },
		}),
		logged,
	};
};

/** An Atom as a dev stack runs it: no Atoms until the stack's server puts one. */
const createDevApp = () => {
	const auth = createDevAuth({ dataDir: newDataDir(), slotCount: 2 });
	opened.push(auth);
	const { logger } = createLogger();
	return createAtomApp({
		ctx: { auth, logger, dev: { auth }, autumnApiUrl: AUTUMN_API_URL },
	});
};

/** The Autumn API answering whatever Atom forwards to it. */
const autumnAnswering = ({ status, body }: { status: number; body: unknown }) =>
	spyOn(globalThis, "fetch").mockResolvedValue(Response.json(body, { status }));

afterEach(() => {
	spyOn(globalThis, "fetch").mockRestore();
	for (const auth of opened.splice(0)) auth.close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const post = ({
	body,
	headers = {},
}: {
	body: unknown;
	headers?: Record<string, string>;
}) => ({
	method: "POST",
	headers: { "content-type": "application/json", ...headers },
	body: JSON.stringify(body),
});

const withToken = (token: string | null): Record<string, string> =>
	token ? { "x-atom-token": token } : {};

/** The fixture customer `cus_1` holding `balance` messages, as Autumn sends it. */
const subjectBody = ({ balance }: { balance: number }) => {
	const state = createState({ balance });
	return {
		state,
		catalog: createCatalogFor({ state }),
		org: atomOrg,
		log_offset: "41",
		read_at: 1700,
	};
};

const setSubject = ({
	balance,
	token = ATOM_TOKEN,
}: {
	balance: number;
	token?: string | null;
}) => post({ headers: withToken(token), body: subjectBody({ balance }) });

/** A check on `cus_1`'s messages as an SDK on the latest API version sends it. */
const checkMessages = ({
	token = ATOM_TOKEN,
	...body
}: {
	token?: string | null;
	[field: string]: unknown;
} = {}) =>
	post({
		headers: {
			...withToken(token),
			authorization: SECRET_KEY,
			"x-api-version": LATEST_VERSION,
		},
		body: { customer_id: "cus_1", feature_id: "messages", ...body },
	});

const putAtom = ({ id, token }: { id: string; token: string }) =>
	post({ body: { id, token_hash: hashToken({ token }) } });

describe("an Atom in an org's cloud", () => {
	test("a check answers from the subject Autumn sent, in the API's own shape", async () => {
		const { app } = createDeployedApp();
		const stored = await app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10 }),
		);
		expect(stored.status).toBe(200);

		const allowed = await app.request(
			"/v1/balances.check",
			checkMessages({ required_balance: 10 }),
		);
		const refused = await app.request(
			"/v1/balances.check",
			checkMessages({ required_balance: 11 }),
		);

		expect(await allowed.json()).toMatchObject({
			allowed: true,
			customer_id: "cus_1",
			required_balance: 10,
			balance: { feature_id: "messages", remaining: 10 },
		});
		expect(await refused.json()).toMatchObject({ allowed: false });
		expect(allowed.headers.get("x-atom-forwarded")).toBeNull();
	});

	test("fields the API keeps for itself are dropped from the answer, as the API drops them", async () => {
		const { app } = createDeployedApp();
		await app.request("/v1/subjects.set", setSubject({ balance: 10 }));

		const response = await app.request("/v1/balances.check", checkMessages());
		const { balance } = await response.json();

		expect(balance.object).toBeUndefined();
		expect(balance.breakdown[0].object).toBeUndefined();
		expect(balance.breakdown[0].overage).toBeUndefined();
	});

	test("required_balance defaults to 1", async () => {
		const { app } = createDeployedApp();
		await app.request("/v1/subjects.set", setSubject({ balance: 0 }));

		const response = await app.request("/v1/balances.check", checkMessages());

		expect(await response.json()).toMatchObject({
			allowed: false,
			required_balance: 1,
		});
	});

	test("a request without the Atom's token is refused in the API's error shape, and stores nothing", async () => {
		const { app } = createDeployedApp();
		const fetchSpy = autumnAnswering({ status: 200, body: {} });

		const keylessPush = await app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10, token: null }),
		);
		const wrongPush = await app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10, token: "atom_token_2" }),
		);
		const keylessCheck = await app.request(
			"/v1/balances.check",
			checkMessages({ token: null }),
		);
		const check = await app.request("/v1/balances.check", checkMessages());

		expect(keylessPush.status).toBe(401);
		expect(wrongPush.status).toBe(401);
		expect(keylessCheck.status).toBe(401);
		expect(await keylessCheck.json()).toEqual({
			message: "Atom token required",
			code: "atom_token_required",
		});
		// Neither push landed, so Atom still does not hold the customer.
		expect(check.headers.get("x-atom-forwarded")).toBe("customer_not_stored");
		expect(fetchSpy).toHaveBeenCalledTimes(1);
	});

	test("fields Atom does not read never fail a request", async () => {
		const { app } = createDeployedApp();
		const body = subjectBody({ balance: 10 });
		const stored = await app.request(
			"/v1/subjects.set",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { ...body, state: { ...body.state, added_later: true } },
			}),
		);

		const response = await app.request(
			"/v1/balances.check",
			checkMessages({ send_event: false, added_later: true }),
		);

		expect(stored.status).toBe(200);
		expect(await response.json()).toMatchObject({ allowed: true });
	});

	test("a push Atom cannot read is a 400, and is not logged as a failure", async () => {
		const { app, logged } = createDeployedApp();

		const subject = await app.request(
			"/v1/subjects.set",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { state: {}, log_offset: "41" },
			}),
		);

		expect(subject.status).toBe(400);
		expect(logged).toEqual([]);
	});

	test("the routes that add and remove Atoms do not exist", async () => {
		const { app } = createDeployedApp();

		const response = await app.request(
			"/v1/atoms.put",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { id: "atom_2", token_hash: hashToken({ token: "token_2" }) },
			}),
		);

		expect(response.status).toBe(404);
	});
});

describe("a customer push that arrives late", () => {
	test("is reported as not stored, and the newer customer stays", async () => {
		const { app } = createDeployedApp();
		const newer = { ...subjectBody({ balance: 3 }), read_at: 1800 };
		const older = { ...subjectBody({ balance: 10 }), read_at: 1700 };
		const push = (body: unknown) =>
			app.request(
				"/v1/subjects.set",
				post({ headers: withToken(ATOM_TOKEN), body }),
			);

		const first = await push(newer);
		const late = await push(older);
		const check = await app.request(
			"/v1/balances.check",
			checkMessages({ required_balance: 5 }),
		);

		expect(await first.json()).toEqual({ stored: true });
		expect(await late.json()).toEqual({ stored: false });
		expect(await check.json()).toMatchObject({ allowed: false });
	});
});

describe("a check Atom does not answer itself", () => {
	test("is sent to the Autumn API as it arrived, and the API's reply is returned unchanged", async () => {
		const { app } = createDeployedApp();
		const apiReply = { allowed: true, customer_id: "cus_2", balance: null };
		const fetchSpy = autumnAnswering({ status: 200, body: apiReply });
		const check = checkMessages({ customer_id: "cus_2" });

		const response = await app.request(
			"/v1/balances.check?expand=balance.feature",
			check,
		);

		const [url, forwarded] = fetchSpy.mock.calls[0] ?? [];
		const headers = new Headers(forwarded?.headers);
		expect(String(url)).toBe(
			`${AUTUMN_API_URL}/v1/balances.check?expand=balance.feature`,
		);
		expect(forwarded?.method).toBe("POST");
		expect(forwarded?.body).toBe(check.body);
		expect(headers.get("authorization")).toBe(SECRET_KEY);
		expect(headers.get("x-api-version")).toBe(LATEST_VERSION);
		expect(headers.get("x-atom-token")).toBeNull();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(apiReply);
		expect(response.headers.get("x-atom-forwarded")).toBe(
			"customer_not_stored",
		);
	});

	test("an error from the API reaches the caller as the API sent it", async () => {
		const { app } = createDeployedApp();
		const apiError = {
			message: "customer_id is required",
			code: "invalid_inputs",
		};
		autumnAnswering({ status: 400, body: apiError });

		const response = await app.request(
			"/v1/balances.check",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { feature_id: "messages" },
			}),
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual(apiError);
		expect(response.headers.get("x-atom-forwarded")).toBe("unreadable_request");
	});

	test("what the request asks for decides it, before any customer is read", async () => {
		const { app } = createDeployedApp();
		await app.request("/v1/subjects.set", setSubject({ balance: 10 }));
		autumnAnswering({ status: 200, body: {} });

		const deducting = await app.request(
			"/v1/balances.check",
			checkMessages({ send_event: true }),
		);

		expect(deducting.headers.get("x-atom-forwarded")).toBe("send_event");
	});

	test("an API that cannot be reached is a 502 in the API's error shape", async () => {
		const { app, logged } = createDeployedApp();
		spyOn(globalThis, "fetch").mockRejectedValue(new Error("connect refused"));

		const response = await app.request(
			"/v1/balances.check",
			checkMessages({ customer_id: "cus_2" }),
		);

		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({
			message: "Atom could not reach the Autumn API",
			code: "atom_upstream_unreachable",
		});
		expect(logged).toHaveLength(1);
	});
});

describe("the shared catalog", () => {
	const rows = createCatalogRowsFor({ state: createState() });

	test("Autumn sets the org's catalog under the Atom's token", async () => {
		const { app } = createDeployedApp();

		const stored = await app.request(
			"/v1/catalog.set",
			post({ headers: withToken(ATOM_TOKEN), body: { rows, read_at: 1700 } }),
		);
		const withoutToken = await app.request(
			"/v1/catalog.set",
			post({ body: { rows, read_at: 1700 } }),
		);

		expect(await stored.json()).toEqual({ stored: true });
		expect(withoutToken.status).toBe(401);
	});

	test("a row Atom cannot key is a 400", async () => {
		const { app } = createDeployedApp();

		const unknownTable = await app.request(
			"/v1/catalog.set",
			post({
				headers: withToken(ATOM_TOKEN),
				body: {
					rows: [{ table: "coupons", row: { id: "c_1" } }],
					read_at: 1700,
				},
			}),
		);
		const noId = await app.request(
			"/v1/catalog.set",
			post({
				headers: withToken(ATOM_TOKEN),
				body: {
					rows: [{ table: "features", row: { id: "messages" } }],
					read_at: 1700,
				},
			}),
		);

		expect(unknownTable.status).toBe(400);
		expect(noId.status).toBe(400);
	});
});

describe("an Atom on a dev stack", () => {
	test("the stack's server puts an Atom per org, and each token reads only its own customers", async () => {
		const app = createDevApp();
		await app.request(
			"/v1/atoms.put",
			putAtom({ id: "org_a.sandbox", token: "token_a" }),
		);
		const added = await app.request(
			"/v1/atoms.put",
			putAtom({ id: "org_b.sandbox", token: "token_b" }),
		);
		await app.request(
			"/v1/subjects.set",
			setSubject({ balance: 10, token: "token_a" }),
		);

		autumnAnswering({ status: 200, body: {} });

		const orgA = await app.request(
			"/v1/balances.check",
			checkMessages({ token: "token_a" }),
		);
		const orgB = await app.request(
			"/v1/balances.check",
			checkMessages({ token: "token_b" }),
		);

		expect(await added.json()).toEqual({ id: "org_b.sandbox" });
		expect(await orgA.json()).toMatchObject({ allowed: true });
		expect(orgB.headers.get("x-atom-forwarded")).toBe("customer_not_stored");
	});

	test("a deleted Atom's token stops working", async () => {
		const app = createDevApp();
		await app.request(
			"/v1/atoms.put",
			putAtom({ id: "org_a.sandbox", token: "token_a" }),
		);

		const deleted = await app.request(
			"/v1/atoms.delete",
			post({ body: { id: "org_a.sandbox" } }),
		);
		const check = await app.request(
			"/v1/balances.check",
			checkMessages({ token: "token_a" }),
		);

		expect(await deleted.json()).toEqual({
			id: "org_a.sandbox",
			deleted: true,
		});
		expect(check.status).toBe(401);
	});

	test("the stack's server can ask whether an Atom is held", async () => {
		const app = createDevApp();
		await app.request(
			"/v1/atoms.put",
			putAtom({ id: "org_a.sandbox", token: "token_a" }),
		);

		const held = await app.request(
			"/v1/atoms.get",
			post({ body: { id: "org_a.sandbox" } }),
		);
		const unknown = await app.request(
			"/v1/atoms.get",
			post({ body: { id: "org_b.sandbox" } }),
		);

		expect(await held.json()).toEqual({ atom: { id: "org_a.sandbox" } });
		expect(await unknown.json()).toEqual({ atom: null });
	});

	test("an id or hash the process cannot use is a 400", async () => {
		const app = createDevApp();

		const badHash = await app.request(
			"/v1/atoms.put",
			post({ body: { id: "org_a.sandbox", token_hash: "not-a-hash" } }),
		);
		const badId = await app.request(
			"/v1/atoms.put",
			putAtom({ id: "../outside", token: "token_a" }),
		);

		expect(badHash.status).toBe(400);
		expect(badId.status).toBe(400);
	});
});
