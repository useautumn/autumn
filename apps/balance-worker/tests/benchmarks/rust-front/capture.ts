import type { MeteringRecord } from "@autumn/kafka";
import { serializeMeteringRecord } from "@autumn/kafka";
import { createTrackCommand } from "../../fixtures/mutations.js";
import { createBenchProcessor } from "../track-throughput/createBenchProcessor.js";
import { scenarios } from "../track-throughput/scenarios.js";
import { createInitializeRequest, testIdentity } from "../../fixtures/mutations.js";

/** Prints one track request body, its reply and its metering record, to size the wire and build the loadgen template. */
const scenario = scenarios.typical;
if (!scenario) throw new Error("scenario");
const records: MeteringRecord[] = [];
const bench = await createBenchProcessor({
	scenario,
	partition: 0,
	latency: { appendMs: 0, applyMs: 0 },
	serialize: true,
	onAppended: (outcomes) => records.push(...outcomes),
});
await bench.processor.initialize({
	request: createInitializeRequest({
		state: scenario.stateFor({ identity: testIdentity }),
		commandId: "init_0",
		requestId: "req_init_0",
	}),
});
const command = {
	...createTrackCommand({
		identity: testIdentity,
		commandId: "trk_0",
		featureId: "feature_0",
		value: 1,
		occurredAt: 1_700_000_000_000,
	}),
	properties: { model: "gpt-x", source: "api" },
};
const body = JSON.stringify({ route: { partition: 0, routeEpoch: "1" }, command });
const reply = await bench.processor.track({ command });
const replyJson = JSON.stringify(reply);
const record = records[0];
if (!record) throw new Error("no record");
const { key, value } = serializeMeteringRecord({ record });
console.log(JSON.stringify({ bodyBytes: body.length, replyBytes: replyJson.length, recordKey: key.length, recordValue: value.length }));
console.log(body);
console.log(replyJson.slice(0, 600));
console.log(value.toString().slice(0, 1500));
process.exit(0);
