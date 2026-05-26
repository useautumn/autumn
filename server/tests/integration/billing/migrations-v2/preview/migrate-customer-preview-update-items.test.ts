/**
 * TDD coverage for migrateCustomer preview shape on update_items migrations.
 *
 * Contract under test:
 *   New types/fields:
 *     - balance_changes[i] is a full ApiBalanceV1 snapshot (object, feature_id,
 *       granted, remaining, usage, breakdown[], rollovers[], next_reset_at...)
 *       plus a sparse `previous_attributes` carrying the OLD values of fields
 *       that changed.
 *     - The legacy `before: { granted, remaining, usage }` shape is gone.
 *   New behaviors:
 *     - For a no-usage `update_items` bump (included 100 → 250), preview emits
 *       a single balance_change with new granted/remaining = 250 and
 *       previous_attributes.granted = previous_attributes.remaining = 100.
 *     - Fields that stayed the same (e.g. usage = 0 before and after) are
 *       omitted from previous_attributes.
 *     - When `update_items` lowers included but tracked usage is preserved,
 *       the balance_change reflects new remaining, with previous_attributes
 *       containing the old granted (and old remaining if it differs).
 *     - Migration that doesn't touch a given feature does NOT emit a
 *       balance_change for it.
 */

import { expect, test } from "bun:test";
import { TestFeature } from "@tests/setup/v2Features";
import { items } from "@tests/utils/fixtures/items";
import { products } from "@tests/utils/fixtures/products";
import { initScenario, s } from "@tests/utils/testInitUtils/initScenario";
import chalk from "chalk";

type MigrationClient = Awaited<ReturnType<typeof initScenario>>["autumnV2_2"];

const timeout = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

const deepParse = (value: unknown): unknown => {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (
			(trimmed.startsWith("{") && trimmed.endsWith("}")) ||
			(trimmed.startsWith("[") && trimmed.endsWith("]"))
		) {
			try {
				return deepParse(JSON.parse(value));
			} catch {
				return value;
			}
		}
		return value;
	}
	if (Array.isArray(value)) return value.map(deepParse);
	if (value && typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) result[k] = deepParse(v);
		return result;
	}
	return value;
};

const parseResponse = (response: unknown): Record<string, unknown> => {
	const parsed = deepParse(response);
	if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
		return parsed as Record<string, unknown>;
	throw new Error(`Invalid migration event response: ${String(response)}`);
};

const waitForPreview = async ({
	autumnV2_2,
	migrationId,
	migrationRunId,
	timeoutMs = 45_000,
}: {
	autumnV2_2: MigrationClient;
	migrationId: string;
	migrationRunId: string;
	timeoutMs?: number;
}): Promise<Record<string, unknown>> => {
	const start = Date.now();
	let lastError: unknown;
	while (Date.now() - start < timeoutMs) {
		try {
			const events = await autumnV2_2.migrationsV2.listItemEvents({
				migrationId,
				migrationRunId,
			});
			const event = events.list[0];
			if (!event) throw new Error("No migration item event found");
			const response = parseResponse(event.response);
			const preview = response.preview;
			if (!preview) throw new Error("Migration item event missing preview");
			return preview as Record<string, unknown>;
		} catch (error) {
			lastError = error;
			await timeout(1_000);
		}
	}
	throw new Error(
		`Timed out waiting for migration preview: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
};

const runPreviewMigration = async ({
	autumnV2_2,
	migrationId,
	filter,
	operations,
}: {
	autumnV2_2: MigrationClient;
	migrationId: string;
	filter: Parameters<
		MigrationClient["migrationsV2"]["deleteAndCreate"]
	>[0]["filter"];
	operations: Parameters<
		MigrationClient["migrationsV2"]["deleteAndCreate"]
	>[0]["operations"];
}) => {
	const migration = await autumnV2_2.migrationsV2.deleteAndCreate({
		id: migrationId,
		filter,
		operations,
	});
	const runResponse = await autumnV2_2.migrationsV2.run({
		id: migration.id,
		dry_run: true,
	});
	return waitForPreview({
		autumnV2_2,
		migrationId: migration.id,
		migrationRunId: runResponse.run_id,
	});
};

test(`${chalk.yellowBright("migrations preview: update_items emits ApiBalanceV1 snapshot + previous_attributes for the touched feature")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-update-items-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-update-items-plan-${suffix}`,
		items: [
			items.monthlyMessages({ includedUsage: 100 }),
			items.monthlyCredits({ includedUsage: 50 }),
		],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [s.billing.attach({ productId: freePlan.id })],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 250 },
						],
					},
				},
			],
		},
	});

	const balanceChanges = preview.balance_changes as Array<
		Record<string, unknown>
	>;

	// Untouched Credits feature → no entry.
	expect(
		balanceChanges.some((change) => change.feature_id === TestFeature.Credits),
	).toBe(false);

	const messagesChange = balanceChanges.find(
		(change) => change.feature_id === TestFeature.Messages,
	);
	expect(messagesChange, "expected a balance change for messages").toBeDefined();

	const balance = messagesChange?.balance as Record<string, unknown>;
	expect(balance).toBeDefined();
	expect(balance).toMatchObject({
		granted: 250,
		remaining: 250,
		usage: 0,
	});
	expect(balance).toHaveProperty("unlimited");
	expect(balance).toHaveProperty("next_reset_at");

	// previous_attributes lives at the balance-change level, NOT inside balance.
	expect(balance).not.toHaveProperty("previous_attributes");
	const previous = messagesChange?.previous_attributes as Record<
		string,
		unknown
	>;
	expect(previous).toBeDefined();
	expect(previous.granted).toBe(100);
	expect(previous.remaining).toBe(100);

	// usage was 0 before and after — must NOT appear in previous_attributes.
	expect(previous).not.toHaveProperty("usage");

	// Top-level shape: just feature_id + balance + previous_attributes. No
	// legacy before/granted at the top level.
	expect(messagesChange).not.toHaveProperty("granted");
	expect(messagesChange).not.toHaveProperty("before");

	// update_items collapses to a single "updated" item_change with the old
	// included value in previous_attributes.
	const planChanges = preview.plan_changes as Array<Record<string, unknown>>;
	const patch = planChanges.find(
		(change) => change.action === "updated" && change.plan_id === freePlan.id,
	);
	expect(patch).toBeDefined();
	const itemChanges = patch?.item_changes as Array<Record<string, unknown>>;
	const messagesItem = itemChanges.find(
		(item) => item.feature_id === TestFeature.Messages,
	);
	expect(messagesItem).toEqual(
		expect.objectContaining({
			action: "updated",
			feature_id: TestFeature.Messages,
			previous_attributes: expect.objectContaining({ included: 100 }),
		}),
	);
});

test(`${chalk.yellowBright("migrations preview: update_items with carried usage surfaces previous granted but not previous usage")}`, async () => {
	const suffix = Date.now();
	const customerId = `migration-preview-update-items-usage-${suffix}`;
	const freePlan = products.base({
		id: `migration-preview-update-items-usage-plan-${suffix}`,
		items: [items.monthlyMessages({ includedUsage: 100 })],
	});

	const { autumnV2_2 } = await initScenario({
		customerId,
		setup: [s.customer(), s.products({ list: [freePlan] })],
		actions: [
			s.billing.attach({ productId: freePlan.id }),
			s.track({ featureId: TestFeature.Messages, value: 30, timeout: 2000 }),
		],
	});

	const preview = await runPreviewMigration({
		autumnV2_2,
		migrationId: `${customerId}-mig`,
		filter: { customer: { plan: { plan_id: freePlan.id } } },
		operations: {
			customer: [
				{
					type: "update_plan",
					plan_filter: { plan_id: freePlan.id },
					customize: {
						update_items: [
							{ filter: { feature_id: TestFeature.Messages }, included: 300 },
						],
					},
				},
			],
		},
	});

	const balanceChanges = preview.balance_changes as Array<
		Record<string, unknown>
	>;
	const change = balanceChanges.find(
		(b) => b.feature_id === TestFeature.Messages,
	);
	expect(change).toBeDefined();

	const balance = change?.balance as Record<string, unknown>;
	// new: granted=300, remaining=270 (300-30 carried usage), usage=30
	expect(balance).toMatchObject({
		granted: 300,
		remaining: 270,
		usage: 30,
	});

	const previous = change?.previous_attributes as Record<string, unknown>;
	// previous: granted=100, remaining=70 (100-30), usage=30 (same)
	expect(previous.granted).toBe(100);
	expect(previous.remaining).toBe(70);
	expect(previous).not.toHaveProperty("usage");
});
