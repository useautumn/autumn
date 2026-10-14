import { describe, expect, test } from "bun:test";
import {
	ATOM_PUSH_MAX_BYTES,
	AtomPushType,
	payloadToQueuedAtomPush,
} from "@autumn/byoc";
import { createQueueAtomClient } from "../../../src/atom/queue/createQueueAtomClient.js";
import type {
	AtomClient,
	AtomSubjectBody,
} from "../../../src/atom/types/atomClient.js";

const subjectBody = ({ padding = "" }: { padding?: string } = {}) =>
	({
		state: { identity: { customerId: "cus_1" }, padding },
		catalog: {},
		org: {},
		log_offset: "7",
		read_at: 1700,
	}) as unknown as AtomSubjectBody;

const incompressible = (bytes: number) =>
	Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("hex");

const createClient = ({ queueOnly = false }: { queueOnly?: boolean } = {}) => {
	const queued: string[] = [];
	const overHttp: string[] = [];
	const warnings: string[] = [];
	const http: AtomClient = {
		setSubject: async () => {
			overHttp.push(AtomPushType.SetSubject);
		},
		deleteSubject: async () => {
			overHttp.push(AtomPushType.DeleteSubject);
		},
		setCatalog: async () => {
			overHttp.push(AtomPushType.SetCatalog);
		},
	};
	const client = createQueueAtomClient({
		ctx: {
			pushQueue: {
				send: async ({ payload }) => {
					queued.push(payload);
				},
			},
			http: queueOnly ? null : http,
			logger: {
				warn: (fields) =>
					warnings.push(String((fields as { type: string }).type)),
			},
		},
		atomId: "org_1.sandbox",
	});
	return { client, queued, overHttp, warnings };
};

describe("queue Atom client", () => {
	test("a subject is queued as the Atom will read it: its folder, customer, read time and body", async () => {
		const { client, queued, overHttp } = createClient();
		const body = subjectBody();

		await client.setSubject({ body });

		expect(overHttp).toEqual([]);
		expect(payloadToQueuedAtomPush({ payload: queued[0] as string })).toEqual({
			type: AtomPushType.SetSubject,
			atomId: "org_1.sandbox",
			customerId: "cus_1",
			body: JSON.stringify(body),
		});
	});

	test("a deletion is queued as subjects.delete, routed by the customer it names: never as a set", async () => {
		const { client, queued } = createClient();
		const body = {
			identity: {
				orgId: "org_1",
				env: "sandbox",
				customerId: "cus_1",
				entityId: null,
			},
			log_offset: "9",
			read_at: 1900,
		};

		await client.deleteSubject({ body });

		expect(payloadToQueuedAtomPush({ payload: queued[0] as string })).toEqual({
			type: AtomPushType.DeleteSubject,
			atomId: "org_1.sandbox",
			customerId: "cus_1",
			body: JSON.stringify(body),
		});
	});

	test("the catalog is queued with the body its HTTP route takes", async () => {
		const { client, queued } = createClient();

		await client.setCatalog({ rows: [], readAt: 1800 });

		expect(payloadToQueuedAtomPush({ payload: queued[0] as string })).toEqual({
			type: AtomPushType.SetCatalog,
			atomId: "org_1.sandbox",
			customerId: null,
			body: JSON.stringify({ rows: [], read_at: 1800 }),
		});
	});

	test("a push too big for one queue message goes over HTTP, and says so", async () => {
		const { client, queued, overHttp, warnings } = createClient();

		await client.setSubject({
			body: subjectBody({ padding: incompressible(ATOM_PUSH_MAX_BYTES) }),
		});

		expect(queued).toEqual([]);
		expect(overHttp).toEqual([AtomPushType.SetSubject]);
		expect(warnings).toEqual(["herald_atom_push_oversized"]);
	});

	test("where pushes go over the queue only, a push too big for one message fails and never reaches HTTP", async () => {
		const { client, queued, overHttp } = createClient({ queueOnly: true });

		await expect(
			client.setSubject({
				body: subjectBody({ padding: incompressible(ATOM_PUSH_MAX_BYTES) }),
			}),
		).rejects.toThrow("too big for the Atom's queue");

		expect(queued).toEqual([]);
		expect(overHttp).toEqual([]);
	});
});
