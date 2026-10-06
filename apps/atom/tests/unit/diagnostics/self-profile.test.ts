import { describe, expect, test } from "bun:test";
import { startSelfProfile } from "../../../src/diagnostics/startSelfProfile.js";

const busyFor = (ms: number) => {
	const until = performance.now() + ms;
	let spins = 0;
	while (performance.now() < until) spins += 1;
	return spins;
};

describe("self profile", () => {
	test("a thread logs its own top functions and CPU each period, for a window of at most half of it", async () => {
		type ProfileLine = { type: string; data: Record<string, unknown> };
		const lines: ProfileLine[] = [];
		const logged = Promise.withResolvers<void>();
		const profile = startSelfProfile({
			everySeconds: 2,
			index: 3,
			logger: {
				info: (fields: unknown) => {
					lines.push(fields as ProfileLine);
					logged.resolve();
				},
				warn: () => {},
			},
		});
		// Keeps the thread busy until the profile lands, so it has samples to report.
		const spin = setInterval(() => busyFor(20), 25);
		await logged.promise;
		clearInterval(spin);
		profile.stop();

		const { type, data } = lines[0] ?? { type: "", data: {} };
		expect(type).toBe("atom_thread_profile");
		expect(data).toMatchObject({
			index: 3,
			served: { checks: 0, pushes: 0, ownedReads: 0 },
		});
		expect(data.elapsedSeconds as number).toBeLessThan(1.5);
		expect(data.threadCpuCores as number).toBeGreaterThan(0);
		expect((data.selfTop as unknown[]).length).toBeGreaterThan(0);
		expect((data.inclusiveTop as unknown[]).length).toBeGreaterThan(0);
	}, 10_000);
});
