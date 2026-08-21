import { describe, expect, test } from "bun:test";
import { InMemoryMeteringLog } from "@/internal/metering/log/inMemoryMeteringLog.js";
import { makeEvent } from "./metering-test-fixtures.js";

const appendGrants = async ({
	log,
	count,
}: {
	log: InMemoryMeteringLog;
	count: number;
}) => {
	const offsets: number[] = [];
	for (let index = 0; index < count; index++) {
		const { offset } = await log.append({
			event: makeEvent({ id: `evt_${index}`, type: "grant", value: 1 }),
		});
		offsets.push(offset);
	}
	return offsets;
};

describe("InMemoryMeteringLog", () => {
	test("append returns contiguous offsets starting at 0", async () => {
		const log = new InMemoryMeteringLog();

		expect(await appendGrants({ log, count: 4 })).toEqual([0, 1, 2, 3]);
	});

	test("read returns records in offset order from fromOffset", async () => {
		const log = new InMemoryMeteringLog();
		await appendGrants({ log, count: 5 });

		const records = await log.read({ fromOffset: 1, limit: 3 });

		expect(records.map((record) => record.offset)).toEqual([1, 2, 3]);
		expect(records.map((record) => record.event.id)).toEqual([
			"evt_1",
			"evt_2",
			"evt_3",
		]);
	});

	test("read past the end returns an empty batch", async () => {
		const log = new InMemoryMeteringLog();
		await appendGrants({ log, count: 2 });

		expect(await log.read({ fromOffset: 2, limit: 10 })).toEqual([]);
		expect(await log.read({ fromOffset: 99, limit: 10 })).toEqual([]);
	});

	test("read is clamped by limit and by the end of the log", async () => {
		const log = new InMemoryMeteringLog();
		await appendGrants({ log, count: 3 });

		expect(await log.read({ fromOffset: 0, limit: 2 })).toHaveLength(2);
		expect(await log.read({ fromOffset: 2, limit: 10 })).toHaveLength(1);
	});

	test("offsets are per partition", async () => {
		const partitionZero = new InMemoryMeteringLog({ partition: 0 });
		const partitionThree = new InMemoryMeteringLog({ partition: 3 });

		await appendGrants({ log: partitionZero, count: 2 });
		const { offset } = await partitionThree.append({
			event: makeEvent({ id: "evt_p3", type: "grant", value: 1 }),
		});

		expect(offset).toBe(0);
		expect(partitionThree.partition).toBe(3);
		expect(
			await partitionThree.read({ fromOffset: 0, limit: 10 }),
		).toHaveLength(1);
	});
});
