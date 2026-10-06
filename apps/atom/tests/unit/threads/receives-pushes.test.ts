import { describe, expect, test } from "bun:test";
import { receivesPushes } from "../../../src/threads/receivesPushes.js";

const receiving = ({
	threads,
	receivers,
}: {
	threads: number;
	receivers: number;
}) =>
	Array.from({ length: threads }, (_, index) => index).filter((index) =>
		receivesPushes({ index, threads, receivers }),
	);

describe("push receivers", () => {
	test("the highest-indexed threads receive, off the low threads that own an extra slot", () => {
		expect(receiving({ threads: 7, receivers: 2 })).toEqual([5, 6]);
	});

	test("every thread receives when told to, a lone thread too; none when no queue is linked", () => {
		expect(receiving({ threads: 7, receivers: 7 })).toEqual([
			0, 1, 2, 3, 4, 5, 6,
		]);
		expect(receiving({ threads: 1, receivers: 1 })).toEqual([0]);
		expect(receiving({ threads: 7, receivers: 0 })).toEqual([]);
	});
});
