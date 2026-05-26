import { readFileSync } from "node:fs";
import pg from "pg";
import { fatal, log } from "../helpers/shell.ts";
import { resolveAgentEntryOrFatal } from "../helpers/registry.ts";
import { PROJECT_ROOT } from "../constants.ts";
import { join } from "node:path";

/**
 * Promotes every user in emulate.config.yaml whose email already exists in
 * the worktree's `user` table to `role = 'admin'`. Missing users are skipped
 * (better-auth creates the row lazily on first sign-in via Google emulate).
 *
 * Scoped to the current agent worktree — refuses to run against canonical so
 * we never accidentally promote everyone on the shared PlanetScale dev DB.
 */
export async function cmdAdmin(): Promise<void> {
	const entry = resolveAgentEntryOrFatal("admin");
	if (!entry.databaseUrl) fatal("worktree has no databaseUrl yet; run 'bun dw setup' first");

	const emails = extractEmulateEmails();
	if (emails.length === 0) {
		log("emulate.config.yaml has no users; nothing to promote");
		return;
	}

	log(`promoting ${emails.length} email(s) in branch ${entry.branchName}`);

	const client = new pg.Client({ connectionString: entry.databaseUrl });
	await client.connect();
	try {
		const res = await client.query<{ email: string; role: string | null }>(
			`UPDATE "user" SET role = 'admin' WHERE email = ANY($1::text[]) RETURNING email, role`,
			[emails],
		);
		const updated = new Set(res.rows.map((r) => r.email));
		for (const email of emails) {
			if (updated.has(email)) {
				console.log(`  ✓ ${email} → admin`);
			} else {
				console.log(`  · ${email} (not present, skipped)`);
			}
		}
		log(`updated ${updated.size}/${emails.length}`);
	} finally {
		await client.end();
	}
}

// Minimal extractor for the `google.users[].email` field shape we ship in
// emulate.config.yaml. Hand-rolled because the dw scripts have no YAML dep
// and the file format is stable.
function extractEmulateEmails(): string[] {
	const yamlPath = join(PROJECT_ROOT, "emulate.config.yaml");
	const contents = readFileSync(yamlPath, "utf-8");
	const emails: string[] = [];
	for (const rawLine of contents.split(/\r?\n/)) {
		const m = rawLine.match(/^\s+email:\s*(\S+)\s*$/);
		if (!m) continue;
		emails.push(m[1]);
	}
	return emails;
}
