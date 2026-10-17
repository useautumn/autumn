import { describe, expect, test } from "bun:test";
import { createStepDownPermits } from "../../../../src/health/stepDown/createStepDownPermits.js";
import { createMemoryAdminObjects } from "./memoryAdminObjects.js";

const DAY = 86_400_000;

function permitsFor({
	memory,
	holder,
	now = Date.now,
}: {
	memory: ReturnType<typeof createMemoryAdminObjects>;
	holder: string;
	now?: () => number;
}) {
	return createStepDownPermits({
		ctx: { objects: memory.objects, now },
		config: { deployment: "prod", holder, slots: 2 },
	});
}

describe("step-down permits", () => {
	test("at most two workers hold a permit at once", async () => {
		const memory = createMemoryAdminObjects();
		const first = await permitsFor({ memory, holder: "a" }).acquire();
		const second = await permitsFor({ memory, holder: "b" }).acquire();
		const third = await permitsFor({ memory, holder: "c" }).acquire();
		expect(first).toMatchObject({ ok: true, permit: { slot: 0 } });
		expect(second).toMatchObject({ ok: true, permit: { slot: 1 } });
		expect(third).toEqual({ ok: false, reason: "all_taken" });
	});

	test("two workers racing for the same slot never both get it", async () => {
		const memory = createMemoryAdminObjects();
		const [a, b] = await Promise.all([
			permitsFor({ memory, holder: "a" }).acquire(),
			permitsFor({ memory, holder: "b" }).acquire(),
		]);
		expect(a.ok && b.ok).toBe(true);
		if (!a.ok || !b.ok) return;
		expect(a.permit.slot).not.toBe(b.permit.slot);
	});

	test("the holder asking again keeps its own slot and its acquisition", async () => {
		const memory = createMemoryAdminObjects();
		const permits = permitsFor({ memory, holder: "a" });
		const first = await permits.acquire();
		const again = await permits.acquire();
		expect(first.ok && again.ok).toBe(true);
		if (!first.ok || !again.ok) return;
		expect(again.permit).toEqual(first.permit);
		expect(memory.stored.size).toBe(1);
	});

	test("a permit never expires: a worker that stays out keeps its slot for as long as it is out", async () => {
		const time = { now: 0 };
		const memory = createMemoryAdminObjects({ now: () => time.now });
		const now = () => time.now;
		await permitsFor({ memory, holder: "a", now }).acquire();
		await permitsFor({ memory, holder: "b", now }).acquire();
		time.now = 7 * DAY;
		expect(await permitsFor({ memory, holder: "c", now }).acquire()).toEqual({
			ok: false,
			reason: "all_taken",
		});
	});

	test("a store that does not answer grants nothing", async () => {
		const memory = createMemoryAdminObjects();
		memory.state.unavailable = true;
		const result = await permitsFor({ memory, holder: "a" }).acquire();
		expect(result).toMatchObject({ ok: false, reason: "unavailable" });
	});

	test("release frees only the holder's own permit, and a released slot is taken again", async () => {
		const memory = createMemoryAdminObjects();
		const a = permitsFor({ memory, holder: "a" });
		const c = permitsFor({ memory, holder: "c" });
		const held = await a.acquire();
		await permitsFor({ memory, holder: "b" }).acquire();
		if (!held.ok) throw new Error("Expected a permit");
		await c.release({ permit: held.permit });
		expect(await c.acquire()).toEqual({ ok: false, reason: "all_taken" });
		await a.release({ permit: held.permit });
		expect(await c.acquire()).toMatchObject({
			ok: true,
			permit: { slot: 0 },
		});
	});

	test("a stale handle released again never frees a later acquisition, even the same holder's", async () => {
		const memory = createMemoryAdminObjects();
		const a = permitsFor({ memory, holder: "a" });
		const first = await a.acquire();
		await permitsFor({ memory, holder: "b" }).acquire();
		if (!first.ok) throw new Error("Expected a permit");
		await a.release({ permit: first.permit });
		const second = await a.acquire();
		expect(second).toMatchObject({ ok: true, permit: { slot: 0 } });
		await a.release({ permit: first.permit });
		expect(await permitsFor({ memory, holder: "c" }).acquire()).toEqual({
			ok: false,
			reason: "all_taken",
		});
	});

	test("a permit record that does not parse is never taken over", async () => {
		const memory = createMemoryAdminObjects();
		memory.put({
			key: "admin/balance-worker-step-down/prod/slot-0.json",
			body: "{not json",
		});
		const taken = await permitsFor({ memory, holder: "a" }).acquire();
		expect(taken).toMatchObject({ ok: true, permit: { slot: 1 } });
	});
});
