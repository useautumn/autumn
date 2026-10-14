import { expect, test } from "bun:test";
import { type OrgConfig, OrgConfigSchema, organizations } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("org config: sequential updates preserve previous fields")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [s.platform.create()],
			actions: [],
		});

		const { db, org } = ctx;

		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		await db.execute(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ cancel_on_past_due: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		await db.execute(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ automatic_tax: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		const [final] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);

		const parsed = OrgConfigSchema.parse(final?.config ?? {});

		expect(parsed.cancel_on_past_due).toBe(true);
		expect(parsed.automatic_tax).toBe(true);
		expect(parsed.include_past_due).toBe(true);
		expect(parsed.block_overdue_entitlements).toBe(false);
	},
);

test.concurrent(
	`${chalk.yellowBright("org config: concurrent updates do not overwrite each other")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [s.platform.create()],
			actions: [],
		});

		const { db, org } = ctx;

		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		await Promise.all([
			db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ cancel_on_past_due: true })}::jsonb
					WHERE id = ${org.id}`,
			),
			db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ automatic_tax: true })}::jsonb
					WHERE id = ${org.id}`,
			),
			db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ anchor_start_of_month: true })}::jsonb
					WHERE id = ${org.id}`,
			),
			db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ disable_stripe_writes: true })}::jsonb
					WHERE id = ${org.id}`,
			),
			db.execute(
				sql`UPDATE organizations
					SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ invoice_memos: true })}::jsonb
					WHERE id = ${org.id}`,
			),
		]);

		const [final] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);

		const parsed = OrgConfigSchema.parse(final?.config ?? {});

		expect(parsed.cancel_on_past_due).toBe(true);
		expect(parsed.automatic_tax).toBe(true);
		expect(parsed.anchor_start_of_month).toBe(true);
		expect(parsed.disable_stripe_writes).toBe(true);
		expect(parsed.invoice_memos).toBe(true);
	},
);

test.concurrent(
	`${chalk.yellowBright("org config: toggling off preserves other fields")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [s.platform.create()],
			actions: [],
		});

		const { db, org } = ctx;

		await db.execute(
			sql`UPDATE organizations
				SET config = ${JSON.stringify({ automatic_tax: true, void_invoices_on_subscription_deletion: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		await db.execute(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ automatic_tax: false })}::jsonb
				WHERE id = ${org.id}`,
		);

		const [result] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);

		const parsed = OrgConfigSchema.parse(result?.config ?? {});

		expect(parsed.automatic_tax).toBe(false);
		expect(parsed.void_invoices_on_subscription_deletion).toBe(true);
	},
);
