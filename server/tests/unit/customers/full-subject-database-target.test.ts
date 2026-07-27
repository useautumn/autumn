/** Protects FullSubject hydration routing without changing ctx.db.
 * Missing replica configuration must fall back visibly to primary. */

import { describe, expect, test } from "bun:test";
import { AppEnv } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { selectFullSubjectDatabase } from "@/internal/customers/repos/getFullSubject/selectFullSubjectDatabase.js";
import { FullSubjectGateEdgeConfigSchema } from "@/internal/misc/fullSubjectGateEdgeConfig/fullSubjectGateEdgeConfigSchemas.js";

const asDatabase = (name: string) => ({ name }) as unknown as DrizzleCli;

const buildContext = ({ database }: { database: DrizzleCli }) =>
	({
		db: database,
		env: AppEnv.Live,
		extraLogs: {},
	}) as unknown as AutumnContext;

describe("FullSubject database routing", () => {
	test("defaults runtime config to primary", () => {
		expect(FullSubjectGateEdgeConfigSchema.parse({}).database_target).toBe(
			"primary",
		);
	});

	test("keeps the hydration query on the request database when primary is configured", () => {
		const primaryDatabase = asDatabase("primary");
		const replicaDatabase = asDatabase("replica");
		const ctx = buildContext({ database: primaryDatabase });

		const selected = selectFullSubjectDatabase({
			ctx,
			configuredTarget: "primary",
			replicaDatabase,
		});

		expect(selected).toEqual({
			database: primaryDatabase,
			configuredTarget: "primary",
			actualTarget: "primary",
			fallbackReason: null,
		});
		expect(ctx.db).toBe(primaryDatabase);
		expect(ctx.extraLogs.fullSubjectDatabase).toEqual({
			configuredTarget: "primary",
			actualTarget: "primary",
			fallbackReason: null,
		});
	});

	test("routes the hydration query to the replica without mutating ctx.db", () => {
		const primaryDatabase = asDatabase("primary");
		const replicaDatabase = asDatabase("replica");
		const ctx = buildContext({ database: primaryDatabase });

		const selected = selectFullSubjectDatabase({
			ctx,
			configuredTarget: "replica",
			replicaDatabase,
		});

		expect(selected).toEqual({
			database: replicaDatabase,
			configuredTarget: "replica",
			actualTarget: "replica",
			fallbackReason: null,
		});
		expect(ctx.db).toBe(primaryDatabase);
		expect(ctx.extraLogs.fullSubjectDatabase).toEqual({
			configuredTarget: "replica",
			actualTarget: "replica",
			fallbackReason: null,
		});
	});

	test("falls back visibly to primary when replica configuration is missing", () => {
		const primaryDatabase = asDatabase("primary");
		const ctx = buildContext({ database: primaryDatabase });

		const selected = selectFullSubjectDatabase({
			ctx,
			configuredTarget: "replica",
			replicaDatabase: null,
		});

		expect(selected).toEqual({
			database: primaryDatabase,
			configuredTarget: "replica",
			actualTarget: "primary",
			fallbackReason: "replica_not_configured",
		});
		expect(ctx.db).toBe(primaryDatabase);
		expect(ctx.extraLogs.fullSubjectDatabase).toEqual({
			configuredTarget: "replica",
			actualTarget: "primary",
			fallbackReason: "replica_not_configured",
		});
	});
});
