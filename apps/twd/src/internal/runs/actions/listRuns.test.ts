import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { TwdContext } from "../../../lib/types/twdContext.ts";
import { getRunStatsSince } from "../repos/runsRepo.ts";
import { listBranchesPage } from "./listRuns.ts";

const testDatabaseUrl = process.env.TWD_TEST_DATABASE_URL;
const MIGRATIONS = join(import.meta.dir, "../../../db/migrations");

const at = (minute: number) => new Date(Date.UTC(2026, 9, 6, 12, minute));

/** Every migration, applied inside a throwaway schema. */
const withMigratedSchema = async (
	fn: (ctx: TwdContext, client: postgres.Sql) => Promise<void>,
) => {
	const schemaName = `twd_branches_${crypto.randomUUID().replaceAll("-", "")}`;
	const admin = postgres(testDatabaseUrl as string, {
		max: 1,
		onnotice: () => {},
	});
	await admin.unsafe(`create schema ${schemaName}`);
	const client = postgres(testDatabaseUrl as string, {
		max: 1,
		onnotice: () => {},
		connection: { search_path: schemaName },
	});
	try {
		const files = (await readdir(MIGRATIONS))
			.filter((f) => f.endsWith(".sql"))
			.sort();
		for (const file of files) {
			const text = (await readFile(join(MIGRATIONS, file), "utf8")).replaceAll(
				'"public".',
				`"${schemaName}".`,
			);
			for (const statement of text.split("--> statement-breakpoint"))
				await client.unsafe(statement);
		}
		await fn({ db: drizzle(client) } as unknown as TwdContext, client);
	} finally {
		await client.end();
		await admin.unsafe(`drop schema ${schemaName} cascade`);
		await admin.end();
	}
};

const insertRun = (
	client: postgres.Sql,
	{
		id,
		branch,
		minute,
		status = "passed",
		costUsd = 1,
	}: {
		id: string;
		branch: string;
		minute: number;
		status?: string;
		costUsd?: number;
	},
) =>
	client`insert into runs ${client({
		id,
		branch,
		sha: "a".repeat(40),
		selection: JSON.stringify({ groups: ["core"] }),
		status,
		cost_usd: costUsd,
		created_by: "system",
		via: "system",
		created_at: at(minute).toISOString(),
		finished_at: status === "running" ? null : at(minute + 1).toISOString(),
	})}`;

test.skipIf(!testDatabaseUrl)(
	"branches page by latest finished run, keeps the newest 12 finished runs each, and pages by cursor",
	async () => {
		await withMigratedSchema(async (ctx, client) => {
			for (let i = 0; i < 14; i++)
				await insertRun(client, { id: `dev_${i}`, branch: "dev", minute: i });
			await insertRun(client, { id: "feat_a_1", branch: "feat/a", minute: 20 });
			await insertRun(client, {
				id: "feat_a_live",
				branch: "feat/a",
				minute: 30,
				status: "running",
			});
			await insertRun(client, { id: "feat_b_1", branch: "feat/b", minute: 5 });
			await insertRun(client, {
				id: "feat_c_live",
				branch: "feat/c",
				minute: 40,
				status: "running",
			});

			const first = await listBranchesPage({ ctx, limit: 2 });
			expect(first.branches.map((b) => b.branch)).toEqual(["feat/a", "dev"]);
			expect(first.branches[0]?.runs.map((r) => r.id)).toEqual(["feat_a_1"]);
			expect(first.branches[1]?.runs.map((r) => r.id)).toEqual(
				Array.from({ length: 12 }, (_, i) => `dev_${13 - i}`),
			);
			expect(first.nextCursor).not.toBeNull();

			const second = await listBranchesPage({
				ctx,
				limit: 2,
				cursor: first.nextCursor ?? undefined,
			});
			expect(second.branches.map((b) => b.branch)).toEqual(["feat/b"]);
			expect(second.nextCursor).toBeNull();

			const filtered = await listBranchesPage({
				ctx,
				limit: 10,
				branch: "feat",
			});
			expect(filtered.branches.map((b) => b.branch)).toEqual([
				"feat/a",
				"feat/b",
			]);

			expect(await getRunStatsSince({ ctx, since: at(20) })).toEqual({
				runs: 3,
				usd: 3,
			});
		});
	},
);
