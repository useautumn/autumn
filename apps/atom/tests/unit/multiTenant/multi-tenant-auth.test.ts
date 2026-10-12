import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashToken } from "../../../src/auth/hashToken.js";
import type { Auth } from "../../../src/auth/types/auth.js";
import {
	createMultiTenantAuth,
	TENANTS_MISS_RESCAN_MS,
	TENANTS_REVALIDATE_MS,
} from "../../../src/multiTenant/createMultiTenantAuth.js";
import {
	allSlotsOwnedHere,
	checkRequestFor,
	checkResponseOf,
	forwardReasonOf,
	freshHeld,
	noSubjectPulls,
	storedSubjectWith,
	subjectPushOf,
} from "../utils/atomFixtures.js";

const opened: Auth[] = [];
const directories: string[] = [];
const newDataDir = () => {
	const dataDir = mkdtempSync(join(tmpdir(), "atom-data-"));
	directories.push(dataDir);
	return dataDir;
};
const open = ({ dataDir }: { dataDir: string }) => {
	const auth = createMultiTenantAuth({
		dataDir,
		slotCount: 2,
		owners: allSlotsOwnedHere,
		heldSubjects: freshHeld(),
		subjectPulls: noSubjectPulls,
	});
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
const storeCustomer = async ({
	auth,
	token,
}: {
	auth: Auth;
	token: string;
}) => {
	await auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" })
		.setSubject(subjectPushOf({ subject: storedSubjectWith({ balance: 10 }) }));
};
const checkCustomer = async ({
	auth,
	token,
}: {
	auth: Auth;
	token: string;
}) => {
	const processor = auth
		.authorize({ token })
		?.processorFor({ customerId: "cus_1" });
	if (!processor) return undefined;
	return checkResponseOf({
		processor,
		request: checkRequestFor({ params: { required_balance: 5 } }),
	});
};

describe("multi-tenant auth", () => {
	test("a token opens the Atom it was put with, and no other", async () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });

		expect(auth.authorize({ token: "token_a" })).not.toBeNull();
		expect(auth.authorize({ token: "token_b" })).toBeNull();
	});

	test("each Atom keeps its own customers", async () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		auth.putAtom({ id: "atom_b", tokenHash: tokenHash("token_b") });
		await storeCustomer({ auth, token: "token_a" });

		expect(await checkCustomer({ auth, token: "token_a" })).toMatchObject({
			allowed: true,
		});
		expect(
			await forwardReasonOf(() => checkCustomer({ auth, token: "token_b" })),
		).toBe("customer_not_stored");
	});

	test("Atoms and their customers are still there after a restart", async () => {
		const dataDir = newDataDir();
		const first = open({ dataDir });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		await storeCustomer({ auth: first, token: "token_a" });
		first.close();

		const reopened = open({ dataDir });

		expect(
			await checkCustomer({ auth: reopened, token: "token_a" }),
		).toMatchObject({
			allowed: true,
		});
	});

	test("putting an Atom again under a new token keeps its customers and retires the old token", async () => {
		const auth = open({ dataDir: newDataDir() });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_old") });
		await storeCustomer({ auth, token: "token_old" });

		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_new") });

		expect(auth.authorize({ token: "token_old" })).toBeNull();
		expect(await checkCustomer({ auth, token: "token_new" })).toMatchObject({
			allowed: true,
		});
	});

	test("removing an Atom deletes its folder and its token stops working", async () => {
		const dataDir = newDataDir();
		const auth = open({ dataDir });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		expect(existsSync(join(dataDir, "atom_a"))).toBe(true);

		auth.removeAtom({ id: "atom_a" });

		expect(auth.authorize({ token: "token_a" })).toBeNull();
		expect(existsSync(join(dataDir, "atom_a"))).toBe(false);
	});

	test("an Atom opens its files only when its token is first used, so an idle one holds none", async () => {
		const dataDir = newDataDir();
		const auth = open({ dataDir });
		auth.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		auth.putAtom({ id: "atom_b", tokenHash: tokenHash("token_b") });

		expect(readdirSync(join(dataDir, "atom_a"))).toEqual(["atom.json"]);

		await storeCustomer({ auth, token: "token_a" });

		expect(readdirSync(join(dataDir, "atom_a"))).toContain("catalog.sqlite");
		expect(readdirSync(join(dataDir, "atom_b"))).toEqual(["atom.json"]);
	});

	test("an Atom held before a restart stays closed until its token is used, then opens", async () => {
		const dataDir = newDataDir();
		const first = open({ dataDir });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		first.close();

		const reopened = open({ dataDir });

		expect(readdirSync(join(dataDir, "atom_a"))).toEqual(["atom.json"]);
		expect(reopened.authorize({ token: "token_a" })).not.toBeNull();
		expect(readdirSync(join(dataDir, "atom_a"))).toContain("catalog.sqlite");
	});

	test("an id that is not a plain folder name is refused", async () => {
		const auth = open({ dataDir: newDataDir() });

		expect(() =>
			auth.putAtom({ id: "../outside", tokenHash: tokenHash("token_a") }),
		).toThrow("Invalid Atom id");
	});
});

/** Two processes over one data directory, on a clock the test moves. */
const openTwoProcesses = () => {
	const dataDir = newDataDir();
	let now = 0;
	const clock = () => now;
	const openProcess = () => {
		const auth = createMultiTenantAuth({
			dataDir,
			slotCount: 2,
			owners: allSlotsOwnedHere,
			heldSubjects: freshHeld(),
			subjectPulls: noSubjectPulls,
			clock,
		});
		opened.push(auth);
		return auth;
	};
	return {
		dataDir,
		first: openProcess(),
		second: openProcess(),
		advance: (ms: number) => {
			now += ms;
		},
	};
};

describe("multi-tenant auth across processes", () => {
	test("an Atom put through one process opens on another as soon as its token is asked for", async () => {
		const { first, second, advance } = openTwoProcesses();
		advance(TENANTS_MISS_RESCAN_MS);

		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		await storeCustomer({ auth: first, token: "token_a" });

		expect(
			await checkCustomer({ auth: second, token: "token_a" }),
		).toMatchObject({
			allowed: true,
		});
		expect(second.hasAtom({ id: "atom_a" })).toBe(true);
	});

	test("a rotated token stops working on the other process within the revalidate bound", async () => {
		const { first, second, advance } = openTwoProcesses();
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_old") });
		advance(TENANTS_MISS_RESCAN_MS);
		await storeCustomer({ auth: second, token: "token_old" });

		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_new") });
		advance(TENANTS_REVALIDATE_MS);

		expect(second.authorize({ token: "token_old" })).toBeNull();
		expect(
			await checkCustomer({ auth: second, token: "token_new" }),
		).toMatchObject({
			allowed: true,
		});
	});

	test("an Atom deleted through one process stops answering on the other, which leaves its folder gone", async () => {
		const { dataDir, first, second, advance } = openTwoProcesses();
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		advance(TENANTS_MISS_RESCAN_MS);
		await storeCustomer({ auth: second, token: "token_a" });

		first.removeAtom({ id: "atom_a" });
		advance(TENANTS_REVALIDATE_MS);

		expect(second.authorize({ token: "token_a" })).toBeNull();
		expect(second.hasAtom({ id: "atom_a" })).toBe(false);
		expect(existsSync(join(dataDir, "atom_a"))).toBe(false);
	});

	test("an Atom deleted and put again under its id reopens on the other process, with none of the old folder's customers", async () => {
		const { first, second, advance } = openTwoProcesses();
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		advance(TENANTS_MISS_RESCAN_MS);
		await storeCustomer({ auth: second, token: "token_a" });

		first.removeAtom({ id: "atom_a" });
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		advance(TENANTS_REVALIDATE_MS);

		expect(
			await forwardReasonOf(() =>
				checkCustomer({ auth: second, token: "token_a" }),
			),
		).toBe("customer_not_stored");
		await storeCustomer({ auth: second, token: "token_a" });
		expect(
			await checkCustomer({ auth: first, token: "token_a" }),
		).toMatchObject({
			allowed: true,
		});
	});

	test("an Atom deleted before the other process ever opened it is not recreated there", async () => {
		const { dataDir, first, second, advance } = openTwoProcesses();
		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		advance(TENANTS_MISS_RESCAN_MS);
		second.authorize({ token: "token_unknown" });

		first.removeAtom({ id: "atom_a" });

		expect(second.authorize({ token: "token_a" })).toBeNull();
		expect(existsSync(join(dataDir, "atom_a"))).toBe(false);
	});

	test("unknown tokens re-read the folders at most once per miss interval", async () => {
		const { first, second, advance } = openTwoProcesses();
		advance(TENANTS_MISS_RESCAN_MS);
		expect(second.authorize({ token: "token_bad" })).toBeNull();

		first.putAtom({ id: "atom_a", tokenHash: tokenHash("token_a") });
		advance(TENANTS_MISS_RESCAN_MS - 1);
		for (let attempt = 0; attempt < 100; attempt++)
			expect(second.authorize({ token: "token_a" })).toBeNull();

		advance(1);
		expect(second.authorize({ token: "token_a" })).not.toBeNull();
	});
});
