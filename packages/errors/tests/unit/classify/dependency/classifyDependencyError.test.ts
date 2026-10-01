import { describe, expect, it } from "bun:test";
import { classifyDependencyError } from "../../../../src/classify/dependency/classifyDependencyError.js";

const named = ({
	name,
	message = "failed",
	...fields
}: { name: string; message?: string } & Record<string, unknown>) =>
	Object.assign(new Error(message), { name, ...fields });

const kindOf = (error: unknown) => classifyDependencyError({ error })?.kind;

describe("classifyDependencyError", () => {
	it("treats socket-level failures and fetch timeouts as infra", () => {
		expect(
			kindOf(Object.assign(new Error("reset"), { code: "ECONNRESET" })),
		).toBe("infra");
		expect(kindOf(named({ name: "TimeoutError" }))).toBe("infra");
	});

	it("treats dropped Postgres connections and resource exhaustion as infra, not constraint errors", () => {
		const pg = (code: string) =>
			Object.assign(new Error("pg"), { code, severity: "FATAL" });
		expect(
			kindOf(Object.assign(new Error("closed"), { code: "CONNECTION_CLOSED" })),
		).toBe("infra");
		expect(kindOf(pg("08006"))).toBe("infra");
		expect(kindOf(pg("53300"))).toBe("infra");
		expect(kindOf(pg("23505"))).toBeUndefined();
	});

	it("treats Kafka client errors as infra", () => {
		expect(kindOf(named({ name: "KafkaJSConnectionError" }))).toBe("infra");
	});

	it("treats AWS throttles and 5xx as infra, but not other AWS errors", () => {
		expect(kindOf(named({ name: "ThrottlingException", $metadata: {} }))).toBe(
			"infra",
		);
		expect(
			kindOf(
				named({ name: "InternalError", $metadata: { httpStatusCode: 503 } }),
			),
		).toBe("infra");
		expect(
			kindOf(
				named({
					name: "QueueDoesNotExist",
					$metadata: { httpStatusCode: 400 },
				}),
			),
		).toBeUndefined();
	});

	it("treats Tinybird rate limits and server errors as infra, even when wrapped", () => {
		const tinybird = named({ name: "TinybirdError", statusCode: 502 });
		expect(kindOf(tinybird)).toBe("infra");
		expect(kindOf(new Error("ingest failed", { cause: tinybird }))).toBe(
			"infra",
		);
		expect(
			kindOf(named({ name: "TinybirdError", statusCode: 400 })),
		).toBeUndefined();
	});

	it("leaves our own errors alone", () => {
		expect(kindOf(new TypeError("x is undefined"))).toBeUndefined();
		expect(kindOf("not an error")).toBeUndefined();
	});
});
