import { afterEach, describe, expect, test } from "bun:test";
import { ATOM_CUSTOMER_ID_HEADER } from "@autumn/byoc";
import {
	cleanUpMultiTenantReplicas,
	createMultiTenantReplica,
	deleteTenant,
	heldFor,
	putTenant,
	TENANT_TOKENS,
} from "./multiTenantReplicaFixtures.js";
import {
	bodyFor,
	cleanUpReplicas,
	connect,
	disconnect,
	settle,
} from "./replicaFixtures.js";

afterEach(() => {
	disconnect();
	cleanUpReplicas();
	cleanUpMultiTenantReplicas();
});

const pushTo = ({
	replica,
	tenant,
	customerId,
}: {
	replica: ReturnType<typeof createMultiTenantReplica>;
	tenant: string;
	customerId: string;
}) =>
	replica.app.request("/v1/subjects.set", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-atom-token": TENANT_TOKENS[tenant] ?? "",
			[ATOM_CUSTOMER_ID_HEADER]: customerId,
		},
		body: bodyFor({ customerId, readAt: 1_700 }),
	});

const pair = () => {
	const a = createMultiTenantReplica({
		address: "10.0.0.1",
		peers: ["10.0.0.2"],
	});
	const b = createMultiTenantReplica({
		address: "10.0.0.2",
		peers: ["10.0.0.1"],
	});
	connect({ replicas: [a, b] });
	return { a, b };
};

describe("a multi-tenant Atom with two replicas", () => {
	test("a tenant put on one replica is held by the other, so its token opens the same org everywhere", async () => {
		const { a, b } = pair();

		expect((await putTenant({ replica: a, id: "org_a" })).status).toBe(200);
		await settle();

		expect(b.auth.hasAtom({ id: "org_a" })).toBe(true);
		expect(
			b.auth.authorize({ token: TENANT_TOKENS.org_a ?? "" }),
		).not.toBeNull();
	});

	test("a push to one tenant on one replica lands under that tenant on the other, and under no other tenant", async () => {
		const { a, b } = pair();
		await putTenant({ replica: a, id: "org_a" });
		await putTenant({ replica: a, id: "org_b" });
		await settle();

		const pushed = await pushTo({
			replica: a,
			tenant: "org_a",
			customerId: "cus_1",
		});
		await settle();

		expect(pushed.status).toBe(200);
		expect(await heldFor({ replica: b, id: "org_a" })).toEqual(["cus_1"]);
		expect(await heldFor({ replica: b, id: "org_b" })).toEqual([]);
	});

	test("a tenant deleted on one replica is gone from the other", async () => {
		const { a, b } = pair();
		await putTenant({ replica: a, id: "org_a" });
		await settle();
		expect(b.auth.hasAtom({ id: "org_a" })).toBe(true);

		expect((await deleteTenant({ replica: b, id: "org_a" })).status).toBe(200);
		await settle();

		expect(a.auth.hasAtom({ id: "org_a" })).toBe(false);
	});

	test("a fresh replica learns every tenant and its rows from a ready peer before it serves", async () => {
		const a = createMultiTenantReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2"],
		});
		const b = createMultiTenantReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			ready: false,
		});
		connect({ replicas: [a] });
		await putTenant({ replica: a, id: "org_a" });
		await putTenant({ replica: a, id: "org_b" });
		await pushTo({ replica: a, tenant: "org_a", customerId: "cus_1" });
		await pushTo({ replica: a, tenant: "org_b", customerId: "cus_2" });
		await settle();

		connect({ replicas: [a, b] });
		await b.sync().catchUp();

		expect(
			b.auth
				.listAtoms()
				.map(({ id }) => id)
				.sort(),
		).toEqual(["org_a", "org_b"]);
		expect(await heldFor({ replica: b, id: "org_a" })).toEqual(["cus_1"]);
		expect(await heldFor({ replica: b, id: "org_b" })).toEqual(["cus_2"]);
	});

	test("a tenant registered while a replica was down reaches it through its next pass, rows included", async () => {
		let now = 1_000_000;
		const a = createMultiTenantReplica({
			address: "10.0.0.1",
			peers: ["10.0.0.2"],
			now: () => now,
		});
		const b = createMultiTenantReplica({
			address: "10.0.0.2",
			peers: ["10.0.0.1"],
			now: () => now,
		});
		const sync = b.sync();
		connect({ replicas: [a] });
		await putTenant({ replica: a, id: "org_b" });
		await pushTo({ replica: a, tenant: "org_b", customerId: "cus_2" });
		await settle();

		now += 60_000;
		connect({ replicas: [a, b] });
		await sync.pass();

		expect(b.auth.hasAtom({ id: "org_b" })).toBe(true);
		expect(await heldFor({ replica: b, id: "org_b" })).toEqual(["cus_2"]);
	});
});
