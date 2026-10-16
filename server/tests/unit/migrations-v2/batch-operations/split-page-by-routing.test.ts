import { afterEach, describe, expect, test } from "bun:test";
import { contexts } from "@tests/utils/fixtures/db/contexts.js";
import { splitPageByRouting } from "@/internal/migrations/v2/batchOperations/execute/routing/splitPageByRouting.js";
import type { BatchMigrationPageCustomer } from "@/internal/migrations/v2/batchOperations/execute/types/batchMigrationExecutionTypes.js";

const previousRollout = process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
const ctx = contexts.create({});

const pageCustomer = ({
	internalId,
	id,
}: {
	internalId: string;
	id: string | null;
}): BatchMigrationPageCustomer => ({ internalId, id, name: null, email: null });

const page = [
	pageCustomer({ internalId: "cus_internal_a", id: "customer_a" }),
	pageCustomer({ internalId: "cus_internal_b", id: null }),
];

const internalIdsOf = (customers: BatchMigrationPageCustomer[]) =>
	customers.map(({ internalId }) => internalId);

afterEach(() => {
	if (previousRollout === undefined)
		delete process.env.BALANCE_WORKER_ROLLOUT_ENABLED;
	else process.env.BALANCE_WORKER_ROLLOUT_ENABLED = previousRollout;
});

describe("splitPageByRouting", () => {
	test("a routed customer goes to the worker; one with no public id has no owner and stays on SQL", () => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "true";
		const { worker, sql } = splitPageByRouting({ ctx, customers: page });
		expect(internalIdsOf(worker)).toEqual(["cus_internal_a"]);
		expect(internalIdsOf(sql)).toEqual(["cus_internal_b"]);
	});

	test("with the rollout off every customer stays on SQL", () => {
		process.env.BALANCE_WORKER_ROLLOUT_ENABLED = "false";
		const { worker, sql } = splitPageByRouting({ ctx, customers: page });
		expect(worker).toEqual([]);
		expect(internalIdsOf(sql)).toEqual(["cus_internal_a", "cus_internal_b"]);
	});
});
