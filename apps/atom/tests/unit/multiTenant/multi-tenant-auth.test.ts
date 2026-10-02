import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import { createMultiTenantAuth } from "../../../src/multiTenant/createMultiTenantAuth.js";
import {
	checkRequestFor,
	forwardReasonOf,
	storedSubjectWith,
} from "../utils/atomFixtures.js";

const opened: Auth[] = [];
const directories: string[] = [];
const newDataDir = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-data-"));
	directories.push(dataDir);
	return dataDir;
};
const open = ({ dataDir }: { dataDir: string }) => {
	const auth = createMultiTenantAuth({ dataDir, slotCount: 2 });
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
	auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" })
		.setSubject({ subject: storedSubjectWith({ balance: 10 }) });
};
const checkCustomer = ({ auth, token }: { auth: Auth; token: string }) =>
	auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" })
		.check({ request: checkRequestFor({ params: { required_balance: 5 } }) });

describe("multi-tenant auth", () => {
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

		expect(checkCustomer({ auth, token: "token_a" })).toMatchObject({
			allowed: true,
		});
		expect(
			forwardReasonOf(() => checkCustomer({ auth, token: "token_b" })),
		).toBe("customer_not_stored");
	});

	test("Atoms and their customers are still there after a restart", () => {
		const dataDir = newDataDir();
		const first = open({ dataDir });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		storeCustomer({ auth: first, token: "token_a" });
		first.close();

		const reopened = open({ dataDir });

		expect(checkCustomer({ auth: reopened, token: "token_a" })).toMatchObject({
			allowed: true,
		});
	});

	test("putting an Atom again under a new token keeps its customers and retires the old token", () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_old") });
		storeCustomer({ auth, token: "token_old" });

		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_new") });

		expect(auth.authorize({ token: "token_old" })).toBeNull();
		expect(checkCustomer({ auth, token: "token_new" })).toMatchObject({
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

	test("an Atom opens its files only when its token is first used, so an idle one holds none", () => {
		const dataDir = newDataDir();
		const auth = open({ dataDir });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		auth.putAtom({ id: "atom_b", tokenHash: tokenHash("token_b") });

		expect(readdirSync(join(dataDir, "atom_a"))).toEqual(["atom.json"]);

		storeCustomer({ auth, token: "token_a" });

		expect(readdirSync(join(dataDir, "atom_a"))).toContain("catalog.sqlite");
		expect(readdirSync(join(dataDir, "atom_b"))).toEqual(["atom.json"]);
	});

	test("an Atom held before a restart stays closed until its token is used, then opens", () => {
		const dataDir = newDataDir();
		const first = open({ dataDir });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		first.close();

		const reopened = open({ dataDir });

		expect(readdirSync(join(dataDir, "atom_a"))).toEqual(["atom.json"]);
		expect(reopened.authorize({ token: "token_a" })).not.toBeNull();
		expect(readdirSync(join(dataDir, "atom_a"))).toContain("catalog.sqlite");
	});

	test("an id that is not a plain folder name is refused", () => {
		const auth = open({ dataDir: newDataDir() });

		expect(() =>
			auth.putAtom({ id: "../outside", tokenHash: tokenHash("token_a") }),
		).toThrow("Invalid Atom id");
	});
});
