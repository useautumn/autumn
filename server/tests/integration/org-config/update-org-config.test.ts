import { expect, test } from "bun:test";
import { type OrgConfig, OrgConfigSchema, organizations } from "@autumn/shared";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";
import { eq, sql } from "drizzle-orm";

test.concurrent(
	`${chalk.yellowBright("org config: sequential updates preserve previous fields")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [],
			actions: [],
		});

		const { db, org } = ctx;

		// Reset config to known empty state
		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		// First update: set cancel_on_past_due via atomic jsonb merge
		await db.execute(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ cancel_on_past_due: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		// Second update: set automatic_tax via atomic jsonb merge
		await db.execute(
			sql`UPDATE organizations
				SET config = COALESCE(config, '{}'::jsonb) || ${JSON.stringify({ automatic_tax: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		// Read final state
		const [final] = await db
			.select({ config: organizations.config })
			.from(organizations)
			.where(eq(organizations.id, org.id))
			.limit(1);

		const parsed = OrgConfigSchema.parse(final?.config ?? {});

		expect(parsed.cancel_on_past_due).toBe(true);
		expect(parsed.automatic_tax).toBe(true);
		expect(parsed.include_past_due).toBe(true); // default

		// Restore
		await db
			.update(organizations)
			.set({ config: org.config })
			.where(eq(organizations.id, org.id));
	},
);

test.concurrent(
	`${chalk.yellowBright("org config: concurrent updates do not overwrite each other")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [],
			actions: [],
		});

		const { db, org } = ctx;

		// Reset config
		await db
			.update(organizations)
			.set({ config: {} as OrgConfig })
			.where(eq(organizations.id, org.id));

		// Fire 5 updates concurrently — each sets a different field
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

		// All 5 fields should be true
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

		// Restore
		await db
			.update(organizations)
			.set({ config: org.config })
			.where(eq(organizations.id, org.id));
	},
);

test.concurrent(
	`${chalk.yellowBright("org config: toggling off preserves other fields")}`,
	async () => {
		const { ctx } = await initScenario({
			setup: [],
			actions: [],
		});

		const { db, org } = ctx;

		// Set two fields on
		await db.execute(
			sql`UPDATE organizations
				SET config = ${JSON.stringify({ automatic_tax: true, void_invoices_on_subscription_deletion: true })}::jsonb
				WHERE id = ${org.id}`,
		);

		// Toggle one off
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

		// Restore
		await db
			.update(organizations)
			.set({ config: org.config })
			.where(eq(organizations.id, org.id));
	},
);
