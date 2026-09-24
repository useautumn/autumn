import { expect, test } from "bun:test";
import { withResidentSubject } from "../../../src/processor/actions/withResidentSubject.js";
import { PartitionProcessorStateNotFoundError } from "../../../src/processor/common/processorErrors.js";

const customerKey = "org_1:live:cus_1";

test("a subject that vanished after ensure is hydrated again and the read answers", async () => {
	let resident = false;
	let ensures = 0;
	const retries: number[] = [];
	const result = await withResidentSubject({
		customerKey,
		ensure: async () => {
			ensures += 1;
			resident = true;
		},
		attempt: () => {
			// The first read finds the rows gone: an evict landed between ensure and read.
			if (ensures === 1) {
				resident = false;
				return null;
			}
			return resident ? { revision: ensures } : null;
		},
		onRetry: ({ attempt }) => {
			retries.push(attempt);
		},
	});
	expect(result).toEqual({ revision: 2 });
	expect(ensures).toBe(2);
	expect(retries).toEqual([1]);
});

test("a decision that found no state is retried the same way", async () => {
	let attempts = 0;
	const result = await withResidentSubject({
		customerKey,
		ensure: async () => undefined,
		attempt: () => {
			attempts += 1;
			if (attempts === 1)
				throw new PartitionProcessorStateNotFoundError({ customerKey });
			return "decided";
		},
	});
	expect(result).toBe("decided");
	expect(attempts).toBe(2);
});

test("other failures are not retried and the state error surfaces after three attempts", async () => {
	let attempts = 0;
	await expect(
		withResidentSubject({
			customerKey,
			ensure: async () => undefined,
			attempt: () => {
				attempts += 1;
				throw new RangeError("unrelated");
			},
		}),
	).rejects.toThrow(RangeError);
	expect(attempts).toBe(1);

	let ensures = 0;
	const retries: number[] = [];
	await expect(
		withResidentSubject({
			customerKey,
			ensure: async () => {
				ensures += 1;
			},
			attempt: () => null,
			onRetry: ({ attempt }) => {
				retries.push(attempt);
			},
		}),
	).rejects.toThrow(PartitionProcessorStateNotFoundError);
	expect(ensures).toBe(3);
	expect(retries).toEqual([1, 2]);
});
