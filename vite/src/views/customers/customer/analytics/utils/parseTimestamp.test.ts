// Day buckets are in the viewer's local zone, so a non-UTC viewer's latest day
// must label as the local day, not a day behind. Run with a non-UTC zone:
//   cd vite && TZ=America/New_York bun test <this file>
// Ref: tickets/ANALYTICS_TIMEZONE_BUCKET_OFFSET.md

import { expect, test } from "bun:test";
import { formatPeriodLabel } from "./parseTimestamp";

const guardTimezone = () => {
	if (process.env.TZ !== "America/New_York") {
		throw new Error(
			`This test must run with TZ=America/New_York (got ${process.env.TZ ?? "unset"}).`,
		);
	}
};

test("day bucket labels as the viewer's local calendar day (not a day behind)", () => {
	guardTimezone();
	// Pipe-emitted local-midnight bucket for the viewer's Jun 4.
	const label = formatPeriodLabel({
		period: "2026-06-04 00:00:00",
		interval: "30d",
	});
	expect(label).toBe("4 Jun");
});

test("hour bucket (24h view) stays on UTC and renders in local time", () => {
	guardTimezone();
	// Hour buckets are emitted by the pipe in UTC. 13:00 UTC -> 09:00 in
	// America/New_York (EDT). This must not regress when day buckets go local.
	const label = formatPeriodLabel({
		period: "2026-06-04 13:00:00",
		interval: "24h",
	});
	expect(label).toBe("09:00");
});
