import { expect, test } from "bun:test";
import { runSoloItemsAlone, soloReasons } from "./soloTestFiles";

test("soloReasons flags the marker and org-wide mutations only", () => {
	expect(soloReasons({ source: "// tw:solo: shares org config" })).toEqual([
		"marker",
	]);
	expect(
		soloReasons({ source: "await OrgService.update({ db, orgId })" }),
	).toEqual(["org config"]);
	expect(soloReasons({ source: "await autumnV1.customers.get(id)" })).toEqual(
		[],
	);
});

test("solo items never overlap anything, shared items keep their parallelism", async () => {
	let inFlight = 0;
	let peakShared = 0;
	const soloOverlaps: string[] = [];

	await runSoloItemsAlone({
		items: ["a", "solo-1", "b", "c", "solo-2", "d"],
		isSolo: (item) => item.startsWith("solo"),
		maxParallel: 2,
		run: ({ item, limit }) =>
			limit(async () => {
				inFlight++;
				if (item.startsWith("solo") && inFlight > 1) soloOverlaps.push(item);
				if (!item.startsWith("solo"))
					peakShared = Math.max(peakShared, inFlight);
				await Bun.sleep(10);
				inFlight--;
			}),
	});

	expect(soloOverlaps).toEqual([]);
	expect(peakShared).toBe(2);
});

test("with no solo items, every item shares one window", async () => {
	let inFlight = 0;
	let peak = 0;

	await runSoloItemsAlone({
		items: [1, 2, 3, 4, 5],
		isSolo: () => false,
		maxParallel: 3,
		run: ({ limit }) =>
			limit(async () => {
				inFlight++;
				peak = Math.max(peak, inFlight);
				await Bun.sleep(10);
				inFlight--;
			}),
	});

	expect(peak).toBe(3);
});
