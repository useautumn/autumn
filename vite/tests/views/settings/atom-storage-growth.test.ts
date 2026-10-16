import { describe, expect, test } from "bun:test";
import type { ApiAtomUpdate, AtomVolume } from "@autumn/shared";
import { atomStorageGrowth } from "../../../src/views/settings/sections/components/atom/monitoring/atomStorageGrowth";

const GIB = 1024 ** 3;
const NOW = Date.parse("2026-10-16T12:10:00Z");
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

/** Two replicas reporting filesystems of `gibs` (a 50 GiB volume reports a little under 50). */
const volumes = (...gibs: number[]): AtomVolume[] =>
	gibs.map((gib, index) => ({
		replica_id: `replica_${index}`,
		used_bytes: 10 * GIB,
		total_bytes: gib * GIB,
		at: NOW,
	}));

const growth = (params: {
	update: ApiAtomUpdate | null;
	volumes?: AtomVolume[];
}) =>
	atomStorageGrowth({
		targetGib: 50,
		volumes: params.volumes ?? [],
		update: params.update,
		now: NOW,
	});

describe("a storage grow's progress", () => {
	test("nothing shows without an update", () => {
		expect(growth({ update: null })).toBeNull();
	});

	test("a queued update is requested", () => {
		expect(
			growth({ update: update("requested"), volumes: volumes(19.6, 19.6) }),
		).toMatchObject({
			phase: "requested",
			at: REQUESTED_AT,
		});
	});

	test("an applying update grows, counting the replicas that already report the new size", () => {
		expect(
			growth({ update: update("applying"), volumes: volumes(49.1, 19.6) }),
		).toMatchObject({
			phase: "growing",
			grownReplicas: 1,
		});
	});

	test("alien's success waits on both replicas reporting the new size", () => {
		const succeeded = update("succeeded", {
			completed_at: Date.parse("2026-10-16T12:05:00Z"),
		});
		expect(
			growth({ update: succeeded, volumes: volumes(49.1, 19.6) })?.phase,
		).toBe("growing");
		expect(
			growth({ update: succeeded, volumes: volumes(49.1, 49.2) }),
		).toMatchObject({
			phase: "complete",
			grownReplicas: 2,
		});
	});

	test("a complete grow stops showing after ten minutes", () => {
		const longAgo = update("succeeded", {
			completed_at: Date.parse("2026-10-16T11:30:00Z"),
		});
		expect(
			growth({ update: longAgo, volumes: volumes(49.1, 49.2) }),
		).toBeNull();
	});

	test("a failed update carries alien's reason", () => {
		expect(
			growth({
				update: update("failed", {
					error: "Volume modification rate limit reached",
				}),
				volumes: volumes(19.6, 19.6),
			}),
		).toMatchObject({
			phase: "failed",
			error: "Volume modification rate limit reached",
		});
	});

	test("another update running while both replicas already have the size is not a grow in progress", () => {
		expect(
			growth({ update: update("applying"), volumes: volumes(49.1, 49.2) })
				?.phase,
		).not.toBe("growing");
	});
});
