/**
 * The one subjects.set body builder, shared by herald's push and the server's pull.
 *
 *  the worker's logOffset wins over a fallback; without either the server gets null (it answers 503);
 *  read_at is the clock before the worker read; a customer version rides only when given.
 */

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type { ReadSubjectStateReply } from "@autumn/balance-worker-client/protocol";
import type { Organization } from "@autumn/shared";
import { readAtomSubjectBody } from "../../src/subjects/readAtomSubjectBody.js";

const org = {
	id: "org_1",
	config: { include_past_due: true },
	default_currency: "usd",
} as unknown as Organization;

const identity = {
	orgId: "org_1",
	env: "sandbox",
	customerId: "cus_1",
	entityId: "ent_1",
};

let now = 1_000;
const readWith = ({
	reply,
	fallbackLogOffset,
	customerVersion,
}: {
	reply: Partial<ReadSubjectStateReply>;
	fallbackLogOffset?: bigint | null;
	customerVersion?: bigint | null;
}) =>
	readAtomSubjectBody({
		ctx: {
			balanceWorkerClient: {
				readSubjectState: async () => {
					now = 2_000;
					return { state: {}, catalog: {}, ...reply } as ReadSubjectStateReply;
				},
			},
		},
		identity,
		org,
		requestId: "req_1",
		fallbackLogOffset,
		customerVersion,
	});

beforeEach(() => {
	now = 1_000;
	spyOn(Date, "now").mockImplementation(() => now);
});
afterEach(() => {
	(Date.now as unknown as { mockRestore(): void }).mockRestore();
});

test("the worker's offset wins; the fallback only stands in for a worker that names none", async () => {
	expect(
		(await readWith({ reply: { logOffset: "180" }, fallbackLogOffset: 120n }))
			?.log_offset,
	).toBe("180");
	expect(
		(await readWith({ reply: {}, fallbackLogOffset: 120n }))?.log_offset,
	).toBe("120");
});

test("2.3 a worker that names no offset, and no fallback: null", async () => {
	expect(await readWith({ reply: {} })).toBeNull();
});

test("2.5 the body is the subject, the org's settings, and read_at from before the read", async () => {
	expect(
		await readWith({ reply: { logOffset: "7" }, customerVersion: 5n }),
	).toEqual({
		state: {},
		catalog: {},
		org: { config: org.config, default_currency: "usd" },
		log_offset: "7",
		read_at: 1_000,
		customer_version: "5",
	} as never);
	expect(await readWith({ reply: { logOffset: "7" } })).not.toHaveProperty(
		"customer_version",
	);
});
