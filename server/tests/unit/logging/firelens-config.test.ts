/**
 * Contract: FireLens parses Pino's JSON envelope, sends structured records to
 * `express`, keeps console records in `ecs`, and bounds retries and re-emission.
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
			"Rule $level ^(TRACE|DEBUG|INFO|WARN|ERROR|FATAL)$ axiom_express false",
		);
		expect(config).toContain("Emitter_Mem_Buf_Limit 10M");
		expect(config).toMatch(
			/\[FILTER\]\s+Name modify\s+Match axiom_express\s+Remove time\s+Remove region\s+Remove container_id\s+Remove container_name/,
		);
		// Ordering is the contract: a split line reaching the parser first would be
		// unparseable JSON, lose its `level`, and fall through to `ecs` as text.
		expect(config).toContain("mode partial_message");
		expect(config).toContain("multiline.key_content log");
		expect(config.indexOf("mode partial_message")).toBeLessThan(
			config.indexOf("Parser json"),
		);
		expect(config).not.toMatch(/mode partial_message[\s\S]*?multiline\.parser/);

		expect(config).toContain("URI /v1/ingest/express");
		expect(config).toContain("URI /v1/ingest/ecs");
		expect(config.match(/retry_limit 5/g)).toHaveLength(2);
		expect(config).not.toMatch(/\[OUTPUT\]\s+Name http\s+Match \*(?:\s|$)/);
	},
);

test.concurrent(
	"FireLens preserves Pino type while adding source metadata",
	async () => {
		const configPath = path.resolve(
			import.meta.dir,
			"../../../../firelens.conf",
		);
		const config = await Bun.file(configPath).text();

		for (const sourceType of ["server", "workers", "cron", "leaf"]) {
			expect(config).toContain(`Add source_type ${sourceType}`);
		}
		expect(config).not.toMatch(/^\s*Add type (?:server|workers|cron|leaf)$/m);
	},
);
