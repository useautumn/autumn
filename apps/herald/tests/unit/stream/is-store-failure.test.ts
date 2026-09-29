import { expect, test } from "bun:test";
import {
	BalanceWorkerClientError,
	type BalanceWorkerClientErrorCode,
} from "@autumn/balance-worker-client";
import type { WorkerErrorCode } from "@autumn/balance-worker-client/protocol";
import { TinybirdIngestError } from "@autumn/tinybird";
import { isStoreFailure } from "../../../src/stream/landRecords/isStoreFailure.js";

const socketError = (code: string): Error =>
	Object.assign(new Error("socket closed"), { code });

test("a Tinybird ingest failure is judged by what caused it", () => {
	expect(
		isStoreFailure(
			new TinybirdIngestError({
				writtenRows: 2_000,
				cause: socketError("ECONNRESET"),
			}),
		),
	).toBe(true);
	expect(
		isStoreFailure(
			new TinybirdIngestError({
				writtenRows: 0,
				cause: new TypeError("row is not an object"),
			}),
		),
	).toBe(false);
});

const workerError = ({
	code,
	workerCode,
}: {
	code: BalanceWorkerClientErrorCode;
	workerCode?: WorkerErrorCode;
}) =>
	new BalanceWorkerClientError({
		code,
		workerCode,
		outcome: "not_submitted",
		message: code,
	});

test("a balance worker without a settled owner is waited out, not skipped", () => {
	expect(isStoreFailure(workerError({ code: "NO_OWNER" }))).toBe(true);
	expect(isStoreFailure(workerError({ code: "ROUTE_STILL_STALE" }))).toBe(true);
	expect(
		isStoreFailure(
			workerError({ code: "WORKER_ERROR", workerCode: "NOT_READY" }),
		),
	).toBe(true);
});

test("a customer the worker does not know is the record's own failure", () => {
	expect(
		isStoreFailure(
			workerError({ code: "WORKER_ERROR", workerCode: "CUSTOMER_NOT_FOUND" }),
		),
	).toBe(false);
	expect(isStoreFailure(workerError({ code: "INVALID_RESPONSE" }))).toBe(false);
});
