import { expect, test } from "bun:test";
import { writeFireLensRecord } from "../../../src/utils/logging/writeFireLensRecord.js";

test("writes archive records as a single raw JSON line", () => {
	const chunks: string[] = [];

	writeFireLensRecord({
		record: {
			log_destination: "request_log_archive",
			request_id: "req_123",
			response_body: '{"allowed":true}',
		},
		output: {
			write: (chunk) => {
				chunks.push(chunk);
				return true;
			},
		},
	});

	expect(chunks).toEqual([
		'{"log_destination":"request_log_archive","request_id":"req_123","response_body":"{\\"allowed\\":true}"}\n',
	]);
});
