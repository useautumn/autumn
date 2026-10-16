import { describe, expect, test } from "bun:test";
import type { ApiAtomUpdate, AtomVolume } from "@autumn/shared";
import { atomStorageGrowth } from "../../../src/views/settings/sections/components/atom/monitoring/atomStorageGrowth";

const GIB = 1024 ** 3;
const REQUESTED_AT = Date.parse("2026-10-16T12:00:00Z");

const update = (
	status: ApiAtomUpdate["status"],
	extra: Partial<ApiAtomUpdate> = {},
): ApiAtomUpdate => ({
	status,
	requested_at: REQUESTED_AT,
	completed_at: null,
	error: null,
	...extra,
});

/** Replicas reporting filesystems of `gibs` (a 50 GiB volume reports a little under 50). */
const volumes = (...gibs: number[]): AtomVolume[] =>
	gibs.map((gib, index) => ({
		replica_id: `replica_${index}`,
		used_bytes: 10 * GIB,
		total_bytes: gib * GIB,
		at: REQUESTED_AT,
	}));

const growth = (params: {
	update: ApiAtomUpdate | null;
	volumes?: AtomVolume[];
}) =>
	atomStorageGrowth({
		targetGib: 50,
		volumes: params.volumes ?? [],
		update: params.update,
	});

const FAILED = update("failed", {
	completed_at: Date.parse("2026-10-16T12:01:00Z"),
	error: "Volume modification rate limit reached",
});

describe("a storage grow's progress", () => {
	test("nothing shows without an update", () => {
		expect(growth({ update: null, volumes: volumes(19.6, 19.6) })).toBeNull();
	});

	test("a queued update is requested", () => {
		expect(
			growth({ update: update("requested"), volumes: volumes(19.6, 19.6) }),
		).toMatchObject({ phase: "requested", at: REQUESTED_AT });
	});

	test("an applying update grows, counting the replicas that already report the new size", () => {
		expect(
			growth({ update: update("applying"), volumes: volumes(49.1, 19.6) }),
		).toMatchObject({ phase: "growing", grownReplicas: 1 });
	});

	test("the row goes away once alien's update succeeds, even before the replicas report the new size", () => {
		const succeeded = update("succeeded", {
			completed_at: Date.parse("2026-10-16T12:05:00Z"),
		});
		expect(
			growth({ update: succeeded, volumes: volumes(49.1, 19.6) }),
		).toBeNull();
		expect(
			growth({ update: succeeded, volumes: volumes(49.1, 49.2) }),
		).toBeNull();
	});

	test("a failed grow keeps alien's reason until a later update succeeds", () => {
		expect(growth({ update: FAILED, volumes: volumes(19.6, 19.6) })).toEqual({
			phase: "failed",
			targetGib: 50,
			error: "Volume modification rate limit reached",
			at: Date.parse("2026-10-16T12:01:00Z"),
		});
		expect(
			growth({
				update: update("succeeded", { completed_at: REQUESTED_AT }),
				volumes: volumes(19.6, 19.6),
			}),
		).toBeNull();
	});

	test("an update while every replica already has the size is not a grow, running or failed", () => {
		const grown = volumes(49.1, 49.2);
		expect(growth({ update: update("applying"), volumes: grown })).toBeNull();
		expect(growth({ update: FAILED, volumes: grown })).toBeNull();
	});

	test("without replica readings nothing shows, since a grow can't be told from another update", () => {
		expect(growth({ update: update("applying") })).toBeNull();
		expect(growth({ update: FAILED })).toBeNull();
	});
});
