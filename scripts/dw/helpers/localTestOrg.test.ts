import { afterEach, describe, expect, test } from "bun:test";
import { LOCAL_DATABASE_URL } from "../constants.ts";
import { localTestOrgEnv } from "./setup.ts";

describe("localTestOrgEnv", () => {
	const prevUrl = process.env.DATABASE_URL;
	const prevCritical = process.env.DATABASE_CRITICAL_URL;
	const prevDirect = process.env.AUTUMN_DB_DIRECT;

	afterEach(() => {
		if (prevUrl === undefined) delete process.env.DATABASE_URL;
		else process.env.DATABASE_URL = prevUrl;
		if (prevCritical === undefined) delete process.env.DATABASE_CRITICAL_URL;
		else process.env.DATABASE_CRITICAL_URL = prevCritical;
		if (prevDirect === undefined) delete process.env.AUTUMN_DB_DIRECT;
		else process.env.AUTUMN_DB_DIRECT = prevDirect;
	});

	test("pins local postgres even when Infisical already set DATABASE_URL", () => {
		process.env.DATABASE_URL =
			"postgresql://user:pass@aws-eu-west-2-1.pg.psdb.cloud:6432/autumn";
		process.env.DATABASE_CRITICAL_URL = process.env.DATABASE_URL;
		delete process.env.AUTUMN_DB_DIRECT;

		const env = localTestOrgEnv();
		expect(env.DATABASE_URL).toBe(LOCAL_DATABASE_URL);
		expect(env.DATABASE_CRITICAL_URL).toBe(LOCAL_DATABASE_URL);
		expect(env.AUTUMN_DB_DIRECT).toBe("1");
	});
});
