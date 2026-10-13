import { DurableObject } from "cloudflare:workers";

/** Stripe connected-account id → QA envs whose database uses it. One instance, named "router". */
export class QaRouter extends DurableObject {
	constructor(ctx: DurableObjectState, env: unknown) {
		super(ctx, env as never);
		ctx.storage.sql.exec(
			"CREATE TABLE IF NOT EXISTS routes (account TEXT NOT NULL, env TEXT NOT NULL, PRIMARY KEY (account, env))",
		);
	}

	setAccounts(env: string, accounts: string[]) {
		this.ctx.storage.sql.exec("DELETE FROM routes WHERE env = ?", env);
		for (const account of accounts)
			this.ctx.storage.sql.exec(
				"INSERT OR IGNORE INTO routes (account, env) VALUES (?, ?)",
				account,
				env,
			);
	}

	envsFor(account: string): string[] {
		return this.ctx.storage.sql
			.exec<{ env: string }>(
				"SELECT env FROM routes WHERE account = ?",
				account,
			)
			.toArray()
			.map((row) => row.env);
	}

	all() {
		return this.ctx.storage.sql
			.exec("SELECT account, env FROM routes ORDER BY env")
			.toArray();
	}
}
