/**
 * Contract: FireLens parses Pino's JSON envelope, sends structured records to
 * `express`, archives full request records in Firehose, keeps console records
 * in `ecs`, and bounds retries and re-emission.
 */

import { expect, test } from "bun:test";
import path from "node:path";

test.concurrent(
	"FireLens separates structured and console log datasets",
	async () => {
		const configPath = path.resolve(
			import.meta.dir,
			"../../../../firelens.conf",
		);
		const config = await Bun.file(configPath).text();

		expect(config).toContain("Parsers_File /fluent-bit/etc/parsers.conf");
		expect(config).not.toContain("[PARSER]");
		expect(config).toContain("Key_Name log");
		expect(config).toContain("Parser json");
		expect(config).toContain("Reserve_Data On");
		expect(config).toContain(
			"Rule $log_destination ^request_log_archive$ request_log_archive false",
		);
		expect(config).toContain(
			"Rule $level ^(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)$ axiom_express false",
		);
		expect(config).toContain("Emitter_Mem_Buf_Limit 10M");
		expect(config).toMatch(
			/\[FILTER\]\s+Name modify\s+Match axiom_express\s+Remove time\s+Remove region\s+Remove container_id\s+Remove container_name/,
		);
		expect(config).toContain("URI /v1/ingest/express");
		expect(config).toContain("URI /v1/ingest/ecs");
		expect(config).toMatch(
			/Name rewrite_tag\s+Match request_log_archive\s+Rule \$region \^us-east-1\$ request_log_archive_staging false\s+Rule \$region \^us-east-2\$ request_log_archive_prod false/,
		);
		expect(config).toMatch(
			/Name kinesis_firehose\s+Match request_log_archive_staging\s+Region us-east-1\s+Delivery_Stream tf-request-log-archive-staging-delivery/,
		);
		expect(config).toMatch(
			/Name kinesis_firehose\s+Match request_log_archive_prod\s+Region us-east-2\s+Delivery_Stream tf-request-log-archive-prod-delivery/,
		);
		expect(config.match(/retry_limit 5/g)).toHaveLength(4);
		expect(config).not.toMatch(/\[OUTPUT\]\s+Name http\s+Match \*(?:\s|$)/);
	},
);
