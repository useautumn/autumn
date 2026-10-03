import { expect, mock, spyOn, test } from "bun:test";
import type { EventInsert } from "@autumn/shared";
import { createTinybirdClient } from "../../../src/createTinybirdClient.js";
import { sendUsageEvents } from "../../../src/eventsTinybird/repos/usageEvents.js";
import { usageEventToTinybirdRow } from "../../../src/eventsTinybird/usageEventToTinybirdRow.js";

test("labels quarantined rows after ingestion without changing its result", async () => {
	const calls: string[] = [];
	const tinybird = createTinybirdClient({
		config: {
			region: { baseUrl: "https://tinybird.example.com", token: "test-token" },
			timeoutMs: 1_000,
		},
	});
	const ingestBatch = spyOn(tinybird.api, "ingestBatch").mockImplementation(
		async () => {
			calls.push("ingest");
			return { successful_rows: 0, quarantined_rows: 1 };
		},
	);
	const error = mock((..._args: unknown[]) => {
		calls.push("error");
	});
	const event: EventInsert = {
		id: "event_123",
		org_id: "org_123",
		org_slug: "test-org",
		env: "sandbox",
		customer_id: "customer_123",
		event_name: "messages",
		timestamp: new Date(0),
	};
	await expect(
		sendUsageEvents({
			ctx: {
				tinybird,
				logger: { error },
			},
			events: [event],
		}),
	).resolves.toBeUndefined();
	expect(calls).toEqual(["ingest", "error"]);
	expect(error).toHaveBeenCalledTimes(1);
	expect(ingestBatch).toHaveBeenCalledWith(
		"events",
		[usageEventToTinybirdRow({ event })],
		{
			wait: true,
			maxRetries: 3,
		},
	);
	expect(error).toHaveBeenCalledWith(
		{
			type: "tinybird_rows_quarantined",
			error_type: "tinybird_rows_quarantined",
			data: { quarantinedRows: 1 },
		},
		"Tinybird quarantined usage events",
	);
});
