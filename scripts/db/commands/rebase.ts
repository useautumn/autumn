import { mkdtempSync, copyFileSync, existsSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run } from "../helpers/spawn.ts";
import { REPO_ROOT, MIGRATIONS_DIR, META_DIR, JOURNAL_PATH } from "../helpers/paths.ts";

type JournalEntry = {
	idx: number;
	version: string;
	when: number;
	tag: string;
	breakpoints: boolean;
};

type Journal = {
	version: string;
	dialect: string;
	entries: JournalEntry[];
};

const REMOTE_REF = "origin/dev";

export async function cmdRebase(): Promise<void> {
	// 1. Bail on unresolved schema conflicts.
	const unmerged = await run("git", ["diff", "--name-only", "--diff-filter=U"], {
		cwd: REPO_ROOT,
		stdio: "pipe",
	});
	if (unmerged.code !== 0) {
		console.error(`git diff failed:\n${unmerged.stderr}`);
		process.exit(1);
	}
	const schemaConflicts = unmerged.stdout
		.split("\n")
		.filter((line) => line.startsWith("shared/db/"));
	if (schemaConflicts.length > 0) {
		console.error(
			`unresolved schema conflicts — resolve these first:\n${schemaConflicts.map((f) => `  ${f}`).join("\n")}`,
		);
		process.exit(1);
	}

	// 2. Read local + remote journals.
	const localJournal = readLocalJournal();
	const remoteJournal = await readRemoteJournal();

	if (!remoteJournal) {
		console.log(`nothing to rebase — could not read ${REMOTE_REF}:shared/drizzle/meta/_journal.json (no remote yet?)`);
		return;
	}

	// 3. Find orphaned local entries — same idx as remote, but different tag/when.
	const remoteByIdx = new Map<number, JournalEntry>();
	for (const entry of remoteJournal.entries) remoteByIdx.set(entry.idx, entry);

	const orphans: JournalEntry[] = [];
	for (const entry of localJournal.entries) {
		const remoteEntry = remoteByIdx.get(entry.idx);
		if (!remoteEntry) continue;
		if (remoteEntry.tag !== entry.tag || remoteEntry.when !== entry.when) {
			orphans.push(entry);
		}
	}

	if (orphans.length === 0) {
		console.log("no migration conflicts — nothing to rebase");
		return;
	}

	console.log(`found ${orphans.length} orphaned local migration(s):`);
	for (const orphan of orphans) {
		console.log(`  idx=${orphan.idx} tag=${orphan.tag}`);
	}

	// 4. Back up the orphaned files.
	const backupDir = mkdtempSync(join(tmpdir(), "autumn-db-rebase-"));
	console.log(`backup dir: ${backupDir}`);

	const backups: Array<{ src: string; backup: string }> = [];
	for (const orphan of orphans) {
		const sql = join(MIGRATIONS_DIR, `${orphan.tag}.sql`);
		const snapshot = join(META_DIR, `${formatIdx(orphan.idx)}_snapshot.json`);
		for (const src of [sql, snapshot]) {
			if (!existsSync(src)) continue;
			const backup = join(backupDir, src.replace(/[/\\]/g, "_"));
			copyFileSync(src, backup);
			backups.push({ src, backup });
		}
	}

	// 5. Delete orphans, then restore canonical journal + snapshots from origin/dev.
	for (const orphan of orphans) {
		const sql = join(MIGRATIONS_DIR, `${orphan.tag}.sql`);
		const snapshot = join(META_DIR, `${formatIdx(orphan.idx)}_snapshot.json`);
		if (existsSync(sql)) rmSync(sql);
		if (existsSync(snapshot)) rmSync(snapshot);
	}

	const remoteJournalRaw = await gitShow(`${REMOTE_REF}:shared/drizzle/meta/_journal.json`);
	if (remoteJournalRaw === null) {
		restoreBackups(backups);
		console.error("failed to fetch remote journal — aborted, backups restored");
		process.exit(1);
	}
	writeFileSync(JOURNAL_PATH, remoteJournalRaw);

	for (const orphan of orphans) {
		const snapshotPath = `${REMOTE_REF}:shared/drizzle/meta/${formatIdx(orphan.idx)}_snapshot.json`;
		const remoteEntry = remoteByIdx.get(orphan.idx);
		if (!remoteEntry) continue;
		const snapshotRaw = await gitShow(snapshotPath);
		if (snapshotRaw === null) {
			restoreBackups(backups);
			console.error(`failed to fetch ${snapshotPath} — aborted, backups restored`);
			process.exit(1);
		}
		writeFileSync(join(META_DIR, `${formatIdx(orphan.idx)}_snapshot.json`), snapshotRaw);
	}

	// 6. Regenerate non-interactively. drizzle-kit reads stdin for rename prompts;
	// closing stdin makes it fail fast rather than hang.
	const generate = await run("bun", ["-F", "@autumn/shared", "db:generate"], {
		cwd: REPO_ROOT,
		stdio: "pipe",
	});

	if (generate.code !== 0) {
		restoreBackups(backups);
		console.error("`db:generate` failed during rebase — backups restored.");
		console.error("");
		console.error("Likely cause: drizzle-kit needs interactive input (e.g. column rename detection).");
		console.error("Resolve manually:");
		console.error("  1. Run `bun db:generate` directly in a terminal and answer prompts.");
		console.error("  2. If a duplicate-idx file is produced, delete it and re-run.");
		console.error("");
		console.error("drizzle-kit stderr:");
		console.error(generate.stderr);
		process.exit(1);
	}

	console.log(generate.stdout);

	// 7. Stage everything for the engineer.
	await run("git", ["add", "shared/drizzle/"], { cwd: REPO_ROOT });

	console.log("");
	console.log("rebase complete — review the regenerated migration and commit.");
	console.log(`backup retained at: ${backupDir}`);
}

function readLocalJournal(): Journal {
	const raw = readFileSync(JOURNAL_PATH, "utf8");
	return JSON.parse(raw) as Journal;
}

async function readRemoteJournal(): Promise<Journal | null> {
	const raw = await gitShow(`${REMOTE_REF}:shared/drizzle/meta/_journal.json`);
	if (raw === null) return null;
	return JSON.parse(raw) as Journal;
}

async function gitShow(ref: string): Promise<string | null> {
	const result = await run("git", ["show", ref], { cwd: REPO_ROOT, stdio: "pipe" });
	if (result.code !== 0) return null;
	return result.stdout;
}

function restoreBackups(backups: Array<{ src: string; backup: string }>): void {
	for (const { src, backup } of backups) {
		try {
			copyFileSync(backup, src);
		} catch {
			// best-effort restore
		}
	}
}

function formatIdx(idx: number): string {
	return idx.toString().padStart(4, "0");
}
