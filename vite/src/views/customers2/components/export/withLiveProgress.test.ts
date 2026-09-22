import { describe, expect, it } from "bun:test";
import { CustomerExportPhase } from "@autumn/shared";
import { liveProgressOf } from "./withLiveProgress";

const progressAt = ({
	processed,
	phase = CustomerExportPhase.Exporting,
}: {
	processed: number;
	phase?: CustomerExportPhase;
}) => ({ phase, processed_rows: processed, total_rows: 1_000 });

describe("liveProgressOf", () => {
	it("prefers the realtime frame while it leads", () => {
		expect(
			liveProgressOf({
				polled: progressAt({ processed: 100 }),
				live: progressAt({ processed: 250 }),
			}),
		).toMatchObject({ processed_rows: 250 });
	});

	it("falls back to the poll once a stale frame stops advancing", () => {
		expect(
			liveProgressOf({
				polled: progressAt({ processed: 900 }),
				live: progressAt({ processed: 250 }),
			}),
		).toMatchObject({ processed_rows: 900 });
	});

	it("trusts the poll's phase when a retry restarts the run", () => {
		expect(
			liveProgressOf({
				polled: progressAt({
					processed: 40,
					phase: CustomerExportPhase.Scanning,
				}),
				live: progressAt({ processed: 900 }),
			}),
		).toMatchObject({
			phase: CustomerExportPhase.Scanning,
			processed_rows: 40,
		});
	});

	it("uses whichever source exists on its own", () => {
		const polled = progressAt({ processed: 10 });
		const live = progressAt({ processed: 20 });

		expect(liveProgressOf({ polled, live: null })).toBe(polled);
		expect(liveProgressOf({ polled: undefined, live })).toBe(live);
		expect(liveProgressOf({ polled: undefined, live: null })).toBeNull();
	});
});
