import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
	detectSoloFiles,
	runSoloItemsAlone,
	soloReasons,
} from "./soloTestFiles";

const testsRoot = resolve(import.meta.dir, "../../server/tests");

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

test("a test that mutates the org through a test-local helper is solo", async () => {
	const viaHelper = `${testsRoot}/integration/external-psps/vercel/vercel-marketplace-paid.test.ts`;
	const plain = `${testsRoot}/integration/billing/update-subscription/cancel/end-of-cycle/cancel-end-of-cycle.test.ts`;

	const solo = await detectSoloFiles({ files: [viaHelper, plain] });

	expect([...solo]).toEqual([viaHelper]);
});
