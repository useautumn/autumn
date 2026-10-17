import { describe, expect, test } from "bun:test";
import { createStepDownPermits } from "../../../../src/health/stepDown/createStepDownPermits.js";
import { createMemoryAdminObjects } from "./memoryAdminObjects.js";

const HOUR = 3_600_000;

function permitsFor({
	memory,
	holder,
	now,
}: {
	memory: ReturnType<typeof createMemoryAdminObjects>;
	holder: string;
	now: () => number;
}) {
	return createStepDownPermits({
		ctx: { objects: memory.objects, now },
		config: { deployment: "prod", holder, slots: 2, ttlMs: 6 * HOUR },
	});
}

describe("step-down permits", () => {
	test("at most two workers hold a permit at once", async () => {
		const time = { now: 1_000_000 };
		const memory = createMemoryAdminObjects({ now: () => time.now });
		const now = () => time.now;
		const first = await permitsFor({ memory, holder: "a", now }).acquire();
		const second = await permitsFor({ memory, holder: "b", now }).acquire();
		const third = await permitsFor({ memory, holder: "c", now }).acquire();
		expect(first).toMatchObject({ ok: true, permit: { slot: 0 } });
		expect(second).toMatchObject({ ok: true, permit: { slot: 1 } });
		expect(third).toEqual({ ok: false, reason: "all_taken" });
	});

	test("two workers racing for the same slot never both get it", async () => {
		const memory = createMemoryAdminObjects();
		const [a, b] = await Promise.all([
			permitsFor({ memory, holder: "a", now: Date.now }).acquire(),
			permitsFor({ memory, holder: "b", now: Date.now }).acquire(),
		]);
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.permit.slot).not.toBe(b.permit.slot);
	});

	test("the holder asking again keeps its own slot", async () => {
		const memory = createMemoryAdminObjects();
		const permits = permitsFor({ memory, holder: "a", now: Date.now });
		const first = await permits.acquire();
		const again = await permits.acquire();
		expect(first).toMatchObject({ ok: true, permit: { slot: 0 } });
		expect(again).toMatchObject({ ok: true, permit: { slot: 0 } });
		expect(memory.stored.size).toBe(1);
	});

	test("an expired permit is taken over, a live one is not", async () => {
		const time = { now: 0 };
		const memory = createMemoryAdminObjects({ now: () => time.now });
		const now = () => time.now;
		await permitsFor({ memory, holder: "a", now }).acquire();
		await permitsFor({ memory, holder: "b", now }).acquire();
		time.now = 5 * HOUR;
		expect(await permitsFor({ memory, holder: "c", now }).acquire()).toEqual({
			ok: false,
			reason: "all_taken",
		});
		time.now = 6 * HOUR + 1;
		expect(
			await permitsFor({ memory, holder: "c", now }).acquire(),
		).toMatchObject({ ok: true, permit: { slot: 0 } });
	});

	test("a store that does not answer grants nothing", async () => {
		const memory = createMemoryAdminObjects();
		memory.state.unavailable = true;
		const result = await permitsFor({
			memory,
			holder: "a",
			now: Date.now,
		}).acquire();
		expect(result).toMatchObject({ ok: false, reason: "unavailable" });
	});

	test("release frees only the holder's own permit", async () => {
		const memory = createMemoryAdminObjects();
		const a = permitsFor({ memory, holder: "a", now: Date.now });
		const b = permitsFor({ memory, holder: "b", now: Date.now });
		const held = await a.acquire();
		if (!held.ok) throw new Error("Expected a permit");
		await b.release({ permit: held.permit });
		expect(memory.stored.size).toBe(1);
		await a.release({ permit: held.permit });
		expect(memory.stored.size).toBe(0);
	});
});
