import { describe, expect, test } from "bun:test";
import type { Context } from "hono";
import type { HonoEnv } from "@/honoUtils/HonoEnv.js";
import { shouldUseReplicaDb } from "@/internal/misc/replicaDb/replicaDbConfigs.js";

const createContext = ({
	method,
	path,
}: {
	method: string;
	path: string;
}): Context<HonoEnv> =>
	({
		req: {
			method,
			path,
		},
	}) as Context<HonoEnv>;

describe("shouldUseReplicaDb", () => {
	test("matches the v2 customer list endpoints", () => {
		expect(
			shouldUseReplicaDb(
				createContext({ method: "POST", path: "/v1/customers/list" }),
			),
		).toBe(true);
		expect(
			shouldUseReplicaDb(
				createContext({ method: "POST", path: "/v1/customers.list" }),
			),
		).toBe(true);
	});

	test("does not match non-replica customer routes", () => {
		expect(
			shouldUseReplicaDb(createContext({ method: "GET", path: "/v1/customers" })),
		).toBe(false);
		expect(
			shouldUseReplicaDb(
				createContext({ method: "GET", path: "/v1/customers/cus_123" }),
			),
		).toBe(false);
		expect(
			shouldUseReplicaDb(
				createContext({ method: "POST", path: "/customers/all/search" }),
			),
		).toBe(false);
	});
});
