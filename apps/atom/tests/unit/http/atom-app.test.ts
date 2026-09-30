import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCatalogFor,
	createState,
	org,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { createDeployedAuth } from "../../../src/auth/createDeployedAuth.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createDevAuth } from "../../../src/dev/createDevAuth.js";
import { createAtomApp } from "../../../src/http/createAtomApp.js";

const ATOM_TOKEN = "atom_token_1";

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
	});
	opened.push(auth);
	const { logger, logged } = createLogger();
	return { app: createAtomApp({ ctx: { auth, logger } }), logged };
};

/** An Atom as a dev stack runs it: no Atoms until the stack's server puts one. */
const createDevApp = () => {
	const auth = createDevAuth({ dataDir: newDataDir() });
	opened.push(auth);
	const { logger } = createLogger();
	return createAtomApp({
		ctx: { auth, logger, dev: { auth } },
	});
};

afterEach(() => {
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
	return { state, catalog: createCatalogFor({ state }), org, log_offset: "41" };
};

const setSubject = ({
	balance,
	token = ATOM_TOKEN,
}: {
	balance: number;
	token?: string | null;
}) => post({ headers: withToken(token), body: subjectBody({ balance }) });

const checkMessages = ({
	token = ATOM_TOKEN,
	...body
}: {
	token?: string | null;
	[field: string]: unknown;
} = {}) =>
	post({
		headers: withToken(token),
		body: { customer_id: "cus_1", feature_id: "messages", ...body },
	});

const putAtom = ({ id, token }: { id: string; token: string }) =>
	post({ body: { id, token_hash: hashToken({ token }) } });

describe("an Atom in an org's cloud", () => {
	test("a check answers from the subject Autumn sent", async () => {
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

		expect(await allowed.json()).toEqual({ allowed: true });
		expect(await refused.json()).toEqual({ allowed: false });
	});

	test("required_balance defaults to 1", async () => {
		const { app } = createDeployedApp();
		await app.request("/v1/subjects.set", setSubject({ balance: 0 }));

		const response = await app.request("/v1/balances.check", checkMessages());

		expect(await response.json()).toEqual({ allowed: false });
	});

	test("a request without the Atom's token gets no answer and stores nothing", async () => {
		const { app } = createDeployedApp();

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
		expect(await check.json()).toEqual({ ask_api: "subject_not_stored" });
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
			checkMessages({ send_event: false }),
		);

		expect(stored.status).toBe(200);
		expect(await response.json()).toEqual({ allowed: true });
	});

	test("a customer it does not hold is handed back to the API", async () => {
		const { app } = createDeployedApp();

		const response = await app.request(
			"/v1/balances.check",
			checkMessages({ customer_id: "cus_2" }),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ask_api: "subject_not_stored" });
	});

	test("a body Atom cannot read is a 400, and is not logged as a failure", async () => {
		const { app, logged } = createDeployedApp();

		const check = await app.request(
			"/v1/balances.check",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { feature_id: "messages" },
			}),
		);
		const subject = await app.request(
			"/v1/subjects.set",
			post({
				headers: withToken(ATOM_TOKEN),
				body: { state: {}, log_offset: "41" },
			}),
		);

		expect(check.status).toBe(400);
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

		const orgA = await app.request(
			"/v1/balances.check",
			checkMessages({ token: "token_a" }),
		);
		const orgB = await app.request(
			"/v1/balances.check",
			checkMessages({ token: "token_b" }),
		);

		expect(await added.json()).toEqual({ id: "org_b.sandbox" });
		expect(await orgA.json()).toEqual({ allowed: true });
		expect(await orgB.json()).toEqual({ ask_api: "subject_not_stored" });
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
