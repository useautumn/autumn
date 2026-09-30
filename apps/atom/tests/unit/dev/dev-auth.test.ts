import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	createCatalogFor,
	createState,
	org,
} from "../../../../../packages/balance-engine/tests/unit/engineFixtures.js";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createDevAuth } from "../../../src/dev/createDevAuth.js";

const opened: Auth[] = [];
const directories: string[] = [];
const newDataDir = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-data-"));
	directories.push(dataDir);
	return dataDir;
};
const open = ({ dataDir }: { dataDir: string }) => {
	const auth = createDevAuth({ dataDir });
	opened.push(auth);
	return auth;
};
afterEach(() => {
	for (const auth of opened.splice(0)) auth.close();
	for (const directory of directories.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

const tokenHash = (token: string) => hashToken({ token });

/** Stores the fixture customer `cus_1`, holding 10 messages, through the token's Atom. */
const storeCustomer = ({ auth, token }: { auth: Auth; token: string }) => {
	const state = createState({ balance: 10 });
	auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" })
		.setSubject({
			subject: {
				state,
				catalog: createCatalogFor({ state }),
				org,
				logOffset: 1n,
			},
		});
};
const checkCustomer = ({ auth, token }: { auth: Auth; token: string }) =>
	auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" })
		.check({
			request: {
				requestId: "req_1",
				customerId: "cus_1",
				featureId: "messages",
				requiredBalance: 5,
				properties: null,
				occurredAt: 1_700_000_000_000,
			},
		});

describe("dev auth", () => {
	test("a token opens the Atom it was put with, and no other", () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });

		expect(auth.authorize({ token: "token_a" })).not.toBeNull();
		expect(auth.authorize({ token: "token_b" })).toBeNull();
	});

	test("each Atom keeps its own customers", () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		auth.putAtom({ id: "atom_b", tokenHash: tokenHash("token_b") });
		storeCustomer({ auth, token: "token_a" });

		expect(checkCustomer({ auth, token: "token_a" })).toEqual({
			allowed: true,
		});
		expect(checkCustomer({ auth, token: "token_b" })).toEqual({
			askApi: "subject_not_stored",
		});
	});

	test("Atoms and their customers are still there after a restart", () => {
		const dataDir = newDataDir();
		const first = open({ dataDir });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		storeCustomer({ auth: first, token: "token_a" });
		first.close();

		const reopened = open({ dataDir });

		expect(checkCustomer({ auth: reopened, token: "token_a" })).toEqual({
			allowed: true,
		});
	});

	test("putting an Atom again under a new token keeps its customers and retires the old token", () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_old") });
		storeCustomer({ auth, token: "token_old" });

		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_new") });

		expect(auth.authorize({ token: "token_old" })).toBeNull();
		expect(checkCustomer({ auth, token: "token_new" })).toEqual({
			allowed: true,
		});
	});

	test("removing an Atom deletes its folder and its token stops working", () => {
		const dataDir = newDataDir();
		const auth = open({ dataDir });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		expect(existsSync(join(dataDir, "atom_a"))).toBe(true);

		auth.removeAtom({ id: "atom_a" });

		expect(auth.authorize({ token: "token_a" })).toBeNull();
		expect(existsSync(join(dataDir, "atom_a"))).toBe(false);
	});

	test("an id that is not a plain folder name is refused", () => {
		const auth = open({ dataDir: newDataDir() });

		expect(() =>
			auth.putAtom({ id: "../outside", tokenHash: tokenHash("token_a") }),
		).toThrow("Invalid Atom id");
	});
});
