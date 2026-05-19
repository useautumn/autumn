export function cmdHelp(): void {
	const lines = [
		"",
		"  bun db <subcommand> [--env=dev|staging|prod]",
		"",
		"  Subcommands:",
		"    help                 print this message",
		"    generate             write a new migration .sql file from schema changes",
		"    migrate              apply pending migrations to the target DB",
		"    migrate:dry          preview pending migrations (SQL + safety checks), don't apply",
		"    mark-applied         bootstrap drizzle.__drizzle_migrations on an existing DB",
		"    rebase               resolve a local migration that collided with one on origin/dev",
		"",
		"  --env defaults to dev. migrate and mark-applied auto-wrap themselves",
		"  in `infisical run` so DATABASE_URL is injected automatically.",
		"",
	];
	process.stdout.write(`${lines.join("\n")}\n`);
}
