/**
 * Frozen replay hydration reads one bounded Postgres snapshot and converts it
 * with the historical baseline clock. It never resolves Redis or runs reset work.
 *
 * Red (current): no Postgres replay source exists.
 * Green (after): source reads are primary/read-only/as-of, lifecycle-safe, and
 * abort without returning or caching a late successful state.
 */

import { describe, expect, mock, test } from "bun:test";
import type { FullSubject } from "@autumn/shared";
import { PgDialect } from "drizzle-orm/pg-core";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { createPostgresReplayHydrationSource } from "@/internal/balances/replay/postgres/createPostgresReplayHydrationSource.js";
import type {
	ReplayOrganizationLoader,
	ReplaySubjectLoader,
} from "@/internal/balances/replay/postgres/postgresReplayHydrationPorts.js";
import type { ReplayHydrationSelection } from "@/internal/balances/replay/replayHydrationContracts.js";
import { createReplayHydrationFixture } from "./replay-hydration-fixture.js";

const dialect = new PgDialect();

const createDatabaseHarness = ({
	commitFails = false,
}: {
	commitFails?: boolean;
} = {}) => {
	const transactionConfigs: unknown[] = [];
	const statements: string[] = [];
	const transactionDb = {
		execute: mock(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
			statements.push(dialect.sqlToQuery(query).sql);
			return [];
		}),
	} as unknown as DrizzleCli;
	const db = {
		transaction: mock(
			async (
				callback: (transaction: DrizzleCli) => Promise<unknown>,
				config: unknown,
			) => {
				transactionConfigs.push(config);
				const result = await callback(transactionDb);
				if (commitFails) throw new Error("snapshot commit failed");
				return result;
			},
		),
	} as unknown as DrizzleCli;

	return { db, transactionDb, transactionConfigs, statements };
};

const createSourceHarness = ({
	replayWindowMs = 1_000,
	fullSubject,
	organizationFound = true,
	commitFails = false,
}: {
	replayWindowMs?: number;
	fullSubject?: FullSubject;
	organizationFound?: boolean;
	commitFails?: boolean;
} = {}) => {
	const fixture = createReplayHydrationFixture();
	const database = createDatabaseHarness({ commitFails });
	const subject = fullSubject ?? fixture.fullSubject;
	const loadOrganization = mock(
		async (
			_params: Parameters<ReplayOrganizationLoader>[0],
		): ReturnType<ReplayOrganizationLoader> =>
			organizationFound
				? { org: fixture.ctx.org, features: fixture.ctx.features }
				: null,
	);
	const loadFullSubject = mock(
		async (
			_params: Parameters<ReplaySubjectLoader>[0],
		): ReturnType<ReplaySubjectLoader> => ({ fullSubject: subject }),
	);
	const source = createPostgresReplayHydrationSource({
		db: database.db,
		logger: fixture.ctx.logger,
		replayWindowMs,
		loadOrganization,
		loadFullSubject,
	});

	return {
		...fixture,
		...database,
		source,
		loadOrganization,
		loadFullSubject,
	};
};

const load = ({
	source,
	selection,
	signal = new AbortController().signal,
}: {
	source: ReturnType<typeof createPostgresReplayHydrationSource>;
	selection: ReplayHydrationSelection;
	signal?: AbortSignal;
}) => source.load({ selection, signal });

describe("Postgres replay hydration source", () => {
	test.concurrent(
		"loads balance 72 deterministically through one read-only historical snapshot",
		async () => {
			const harness = createSourceHarness();

			const first = await load(harness);
			const second = await load(harness);

			expect(first).toEqual(second);
			expect(first).toMatchObject({
				kind: "loaded",
				state: {
					identity: harness.selection.identity,
					customerEntitlements: {
						messages_grant: { featureId: "messages", balance: 72 },
					},
				},
			});
			expect(harness.transactionConfigs).toEqual([
				{ isolationLevel: "repeatable read", accessMode: "read only" },
				{ isolationLevel: "repeatable read", accessMode: "read only" },
			]);
			expect(harness.statements).toEqual([
				"SET LOCAL statement_timeout = 2000",
				"SET LOCAL statement_timeout = 2000",
			]);
			expect(harness.loadOrganization).toHaveBeenCalledTimes(2);
			expect(harness.loadOrganization.mock.calls[0]?.[0]).toEqual({
				db: harness.transactionDb,
				orgId: harness.selection.identity.orgId,
				env: harness.ctx.env,
			});

			const subjectCall = harness.loadFullSubject.mock.calls[0]?.[0];
			expect(subjectCall).toMatchObject({
				customerId: harness.selection.identity.customerId,
				readFrom: "primary",
				runLazyResets: false,
				asOfTimestampMs: harness.selection.baseline.capturedAtMs,
			});
			expect(subjectCall?.ctx.db).toBe(harness.transactionDb);
			expect(subjectCall?.ctx.dbGeneral).toBe(harness.transactionDb);
			expect(subjectCall?.ctx.timestamp).toBe(
				harness.selection.baseline.capturedAtMs,
			);
			expect(() => subjectCall?.ctx.redisV2).toThrow(
				"Redis is unavailable in Postgres replay hydration",
			);

			const responseContext = harness.source.readContext({
				identity: harness.selection.identity,
			});
			expect(responseContext.customerId).toBe(
				harness.selection.identity.customerId,
			);
			expect(() => responseContext.redisV2).toThrow(
				"Redis is unavailable in Postgres replay hydration",
			);
		},
	);

	test.concurrent(
		"uses the baseline rather than wall time for reset and expiry eligibility",
		async () => {
			const fixture = createReplayHydrationFixture({
				baseline: { id: "historical", capturedAtMs: 1_700_000_000_000 },
			});
			fixture.customerEntitlement.next_reset_at = 1_700_000_010_000;
			fixture.customerEntitlement.expires_at = 1_700_000_010_000;
			const harness = createSourceHarness({
				fullSubject: fixture.fullSubject,
				replayWindowMs: 1_000,
			});
			const selection = {
				...harness.selection,
				baseline: fixture.selection.baseline,
			};

			expect(fixture.customerEntitlement.next_reset_at).toBeLessThan(
				Date.now(),
			);
			expect(await load({ source: harness.source, selection })).toMatchObject({
				kind: "loaded",
			});
		},
	);

	test.concurrent.each(["reset", "expiry"] as const)(
		"refuses a selected entitlement with %s at the replay-window boundary",
		async (boundary) => {
			const harness = createSourceHarness({ replayWindowMs: 5_000 });
			const boundaryAt = harness.selection.baseline.capturedAtMs + 5_000;
			if (boundary === "reset") {
				harness.customerEntitlement.next_reset_at = boundaryAt;
			} else {
				harness.customerEntitlement.next_reset_at = null;
				harness.customerEntitlement.expires_at = boundaryAt;
			}

			expect(await load(harness)).toEqual({
				kind: "refused",
				category: "unsupported",
				reason: "lifecycle_window",
			});
		},
	);

	test.concurrent.each([
		{ capturedAtMs: -1 },
		{ capturedAtMs: 1.5 },
		{ capturedAtMs: Number.NaN },
		{ capturedAtMs: Number.MAX_SAFE_INTEGER },
	])(
		"refuses invalid or overflowing baseline $capturedAtMs",
		async (baseline) => {
			const harness = createSourceHarness({ replayWindowMs: 1 });
			const selection = {
				...harness.selection,
				baseline: { id: "invalid", ...baseline },
			};

			expect(await load({ source: harness.source, selection })).toEqual({
				kind: "refused",
				category: "unsupported",
				reason: "invalid_baseline",
			});
			expect(harness.transactionConfigs).toEqual([]);
		},
	);

	test.concurrent(
		"classifies missing rows, external identity mismatch, and converter refusals",
		async () => {
			const missingOrganization = createSourceHarness({
				organizationFound: false,
			});
			expect(await load(missingOrganization)).toEqual({
				kind: "refused",
				category: "missing",
				reason: "organization_not_found",
			});

			const missingCustomer = createSourceHarness();
			missingCustomer.loadFullSubject.mockImplementationOnce(
				async () => undefined,
			);
			expect(await load(missingCustomer)).toEqual({
				kind: "refused",
				category: "missing",
				reason: "customer_not_found",
			});

			const missingFeature = createSourceHarness();
			expect(
				await load({
					source: missingFeature.source,
					selection: {
						...missingFeature.selection,
						featureIds: ["missing"],
					},
				}),
			).toEqual({
				kind: "refused",
				category: "missing",
				reason: "feature_not_found",
			});

			const internalIdentity = createSourceHarness();
			expect(
				await load({
					source: internalIdentity.source,
					selection: {
						...internalIdentity.selection,
						identity: {
							...internalIdentity.selection.identity,
							customerId: internalIdentity.fullSubject.internalCustomerId,
						},
					},
				}),
			).toEqual({
				kind: "refused",
				category: "unsupported",
				reason: "subject_mismatch",
			});

			const unknownEnvironment = createSourceHarness();
			expect(
				await load({
					source: unknownEnvironment.source,
					selection: {
						...unknownEnvironment.selection,
						identity: {
							...unknownEnvironment.selection.identity,
							env: "staging",
						},
					},
				}),
			).toEqual({
				kind: "refused",
				category: "unsupported",
				reason: "env_not_supported",
			});

			const unsupported = createSourceHarness();
			unsupported.customerEntitlement.additional_balance = 1;
			expect(await load(unsupported)).toEqual({
				kind: "refused",
				category: "unsupported",
				reason: "additional_balance_not_supported",
			});
		},
	);

	test.concurrent(
		"propagates genuine loader and invariant failures",
		async () => {
			const databaseFailure = createSourceHarness();
			const failure = new Error("database unavailable");
			databaseFailure.loadOrganization.mockImplementationOnce(async () => {
				throw failure;
			});
			await expect(load(databaseFailure)).rejects.toBe(failure);

			const invariantFailure = createSourceHarness();
			invariantFailure.loadFullSubject.mockImplementationOnce(async () => {
				throw new TypeError("fixture invariant broke");
			});
			await expect(load(invariantFailure)).rejects.toBeInstanceOf(TypeError);
		},
	);

	test.concurrent(
		"checks abort after async reads and never publishes a late success",
		async () => {
			const harness = createSourceHarness();
			const subjectRead = Promise.withResolvers<{ fullSubject: FullSubject }>();
			const subjectReadStarted = Promise.withResolvers<void>();
			harness.loadFullSubject.mockImplementationOnce(() => {
				subjectReadStarted.resolve();
				return subjectRead.promise;
			});
			const controller = new AbortController();
			const pending = load({
				source: harness.source,
				selection: harness.selection,
				signal: controller.signal,
			});
			await subjectReadStarted.promise;
			controller.abort(new Error("operator stopped"));
			subjectRead.resolve({ fullSubject: harness.fullSubject });

			await expect(pending).rejects.toThrow("operator stopped");
			expect(() =>
				harness.source.readContext({ identity: harness.selection.identity }),
			).toThrow("context is unavailable");
		},
	);

	test.concurrent("clears cached response context on close", async () => {
		const harness = createSourceHarness();
		await load(harness);
		expect(
			harness.source.readContext({ identity: harness.selection.identity }),
		).toBeDefined();

		harness.source.close();

		expect(() =>
			harness.source.readContext({ identity: harness.selection.identity }),
		).toThrow("context is unavailable");
		await expect(load(harness)).rejects.toThrow("source is closed");
	});

	test.concurrent("refuses to start an already aborted load", async () => {
		const harness = createSourceHarness();
		const controller = new AbortController();
		controller.abort(new Error("cancelled before start"));

		await expect(
			load({
				source: harness.source,
				selection: harness.selection,
				signal: controller.signal,
			}),
		).rejects.toThrow("cancelled before start");
		expect(harness.transactionConfigs).toEqual([]);
	});

	test.concurrent("refuses to mix baselines within one source", async () => {
		const harness = createSourceHarness();
		await load(harness);

		await expect(
			load({
				source: harness.source,
				selection: {
					...harness.selection,
					baseline: {
						id: "other-snapshot",
						capturedAtMs: harness.selection.baseline.capturedAtMs - 1_000,
					},
				},
			}),
		).rejects.toThrow("bound to baseline");
		expect(harness.transactionConfigs).toHaveLength(1);
	});

	test.concurrent(
		"caches detached metadata that reads through the source db, not the transaction",
		async () => {
			const harness = createSourceHarness();
			await load(harness);

			const responseContext = harness.source.readContext({
				identity: harness.selection.identity,
			});

			expect(responseContext.db).toBe(harness.db);
			expect(responseContext.dbGeneral).toBe(harness.db);
			expect(responseContext.db).not.toBe(harness.transactionDb);
			expect(responseContext.timestamp).toBe(
				harness.selection.baseline.capturedAtMs,
			);
			expect(responseContext.org.id).toBe(harness.selection.identity.orgId);
			expect(responseContext.env).toBe(harness.ctx.env);
			expect(Object.keys(responseContext)).not.toContain("redisV2");
			expect(() => ({ ...responseContext })).not.toThrow();
		},
	);

	test.concurrent(
		"reads a response context without touching the database",
		async () => {
			const harness = createSourceHarness();
			await load(harness);
			const transactionCount = harness.transactionConfigs.length;
			const statementCount = harness.statements.length;

			const responseContext = harness.source.readContext({
				identity: harness.selection.identity,
			});

			expect(responseContext.customerId).toBe(
				harness.selection.identity.customerId,
			);
			expect(harness.transactionConfigs).toHaveLength(transactionCount);
			expect(harness.statements).toHaveLength(statementCount);
			expect(harness.loadOrganization).toHaveBeenCalledTimes(1);
			expect(harness.loadFullSubject).toHaveBeenCalledTimes(1);
		},
	);

	test.concurrent(
		"never publishes a context when the snapshot transaction fails to commit",
		async () => {
			const harness = createSourceHarness({ commitFails: true });

			await expect(load(harness)).rejects.toThrow("snapshot commit failed");

			expect(harness.loadFullSubject).toHaveBeenCalledTimes(1);
			expect(() =>
				harness.source.readContext({ identity: harness.selection.identity }),
			).toThrow("context is unavailable");
		},
	);
});
