import { expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import { recordsToCacheSubjects } from "../../../../src/consumers/cachePush/utils/recordsToCacheSubjects.js";
import type { StreamRecord } from "../../../../src/stream/types/streamConsumer.js";

const customer = {
	orgId: "org_1",
	env: AppEnv.Sandbox,
	customerId: "cus_1",
	entityId: null,
};
const entity = (entityId: string) => ({ ...customer, entityId });

const recordAt = ({
	offset,
	identity = customer,
	command,
	result = { type: command.type },
}: {
	offset: number;
	identity?: typeof customer | ReturnType<typeof entity>;
	command: { type: string; entityIds?: string[] };
	result?: { type: string };
}) =>
	({
		position: { topic: "t", partition: 0, offset: BigInt(offset) },
		record: {
			identity,
			command: { ...command, identity: customer, occurredAt: offset },
			result,
		},
	}) as unknown as StreamRecord;

/** Each subject's key as `cus_1` or `cus_1/ent_1`, with its offset and version. */
const summaryOf = (records: StreamRecord[]) =>
	recordsToCacheSubjects({ records }).map(
		({ identity, logOffset, customerVersion }) => ({
			subject: [identity.customerId, identity.entityId]
				.filter(Boolean)
				.join("/"),
			logOffset,
			customerVersion,
		}),
	);

test("an evict raises its customer's version to its own offset", () => {
	expect(
		summaryOf([recordAt({ offset: 200, command: { type: "evict" } })]),
	).toEqual([{ subject: "cus_1", logOffset: 200n, customerVersion: 200n }]);
});

test("a change after an evict in the same slice pushes at its offset, keeping the evict's version", () => {
	expect(
		summaryOf([
			recordAt({ offset: 200, command: { type: "evict" } }),
			recordAt({ offset: 201, command: { type: "track" } }),
		]),
	).toEqual([{ subject: "cus_1", logOffset: 201n, customerVersion: 200n }]);
});

test("an entity's change before an evict carries no version; the customer takes the evict's", () => {
	expect(
		summaryOf([
			recordAt({
				offset: 199,
				identity: entity("ent_1"),
				command: { type: "track" },
			}),
			recordAt({ offset: 200, command: { type: "evict" } }),
		]),
	).toEqual([
		{ subject: "cus_1/ent_1", logOffset: 199n, customerVersion: null },
		{ subject: "cus_1", logOffset: 200n, customerVersion: 200n },
	]);
});

test("of two evicts the later one is the version", () => {
	expect(
		summaryOf([
			recordAt({ offset: 200, command: { type: "evict" } }),
			recordAt({ offset: 300, command: { type: "evict" } }),
		]),
	).toEqual([{ subject: "cus_1", logOffset: 300n, customerVersion: 300n }]);
});

test("a billing plan pushes only its customer, as before: the evict after it covers its entities", () => {
	expect(
		summaryOf([
			recordAt({
				offset: 400,
				command: { type: "applyBillingPlan", entityIds: ["ent_1"] },
			}),
		]),
	).toEqual([{ subject: "cus_1", logOffset: 400n, customerVersion: null }]);
});

test("other customer changes raise no version", () => {
	for (const type of ["track", "reset", "updateBalance", "finalize"])
		expect(summaryOf([recordAt({ offset: 500, command: { type } })])).toEqual([
			{ subject: "cus_1", logOffset: 500n, customerVersion: null },
		]);
});
