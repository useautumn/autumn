import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getCatalogRows, type PostgresClient } from "@autumn/postgres";
import { FreeTrialDuration, schemas } from "@autumn/shared";
import { sql } from "drizzle-orm";
import {
	openFixturePostgres,
	readWorktreeDatabaseUrl,
} from "./postgresCustomerFixture.js";

const databaseUrl = readWorktreeDatabaseUrl();

/** One org's trials in two envs, plus one in another org. Ids sort in the order the lookup must return them. */
const seedFreeTrials = async ({ postgres }: { postgres: PostgresClient }) => {
	const { db } = postgres;
	const suffix = crypto.randomUUID().slice(0, 8);
	const id = (name: string) => `${name}_${suffix}`;
	const orgId = id("org_trial");
	const otherOrgId = id("org_other");
	const ids = {
		orgId,
		otherOrgId,
		sandboxProduct: id("prod_sandbox"),
		liveProduct: id("prod_live"),
		otherOrgProduct: id("prod_other_org"),
		sandboxTrial: id("ft_1_sandbox"),
		customTrial: id("ft_2_custom"),
		liveTrial: id("ft_3_live"),
		otherOrgTrial: id("ft_4_other_org"),
	};

	for (const org of [orgId, otherOrgId]) {
		await db.insert(schemas.organizations).values({
			id: org,
			slug: org,
			name: org,
			createdAt: new Date(),
		});
	}
	for (const [internalId, org, env] of [
		[ids.sandboxProduct, orgId, "sandbox"],
		[ids.liveProduct, orgId, "live"],
		[ids.otherOrgProduct, otherOrgId, "sandbox"],
	] as const) {
		await db.execute(sql`INSERT INTO products (internal_id, id, org_id, env, name, created_at)
			VALUES (${internalId}, ${internalId}, ${org}, ${env}, ${internalId}, 0)`);
	}
	const trial = ({
		trialId,
		productId,
		isCustom,
	}: {
		trialId: string;
		productId: string;
		isCustom: boolean;
	}) =>
		db.execute(sql`INSERT INTO free_trials (id, created_at, internal_product_id, duration, length, unique_fingerprint, is_custom, card_required, on_end)
			VALUES (${trialId}, 1700000000000, ${productId}, 'day', 7, false, ${isCustom}, true, 'revert')`);
	await trial({
		trialId: ids.sandboxTrial,
		productId: ids.sandboxProduct,
		isCustom: false,
	});
	await trial({
		trialId: ids.customTrial,
		productId: ids.sandboxProduct,
		isCustom: true,
	});
	await trial({
		trialId: ids.liveTrial,
		productId: ids.liveProduct,
		isCustom: false,
	});
	await trial({
		trialId: ids.otherOrgTrial,
		productId: ids.otherOrgProduct,
		isCustom: false,
	});

	const cleanup = async () => {
		for (const org of [orgId, otherOrgId]) {
			// free_trials cascade away with their product.
			await db.execute(sql`DELETE FROM products WHERE org_id = ${org}`);
			await db.execute(sql`DELETE FROM organizations WHERE id = ${org}`);
		}
	};
	return { ids, cleanup };
};

type SeededFreeTrials = Awaited<ReturnType<typeof seedFreeTrials>>;

const noOtherIds = {
	entitlementIds: [],
	productInternalIds: [],
	featureInternalIds: [],
	priceIds: [],
	planLicenseIds: [],
};

describe.skipIf(!databaseUrl)("free trial catalog rows", () => {
	let postgres: PostgresClient;
	let seeded: SeededFreeTrials;

	beforeAll(async () => {
		if (!databaseUrl) throw new Error("No worktree DATABASE_URL");
		postgres = openFixturePostgres({ databaseUrl });
		seeded = await seedFreeTrials({ postgres });
	});

	afterAll(async () => {
		await seeded?.cleanup();
		await postgres?.close();
	});

	const readFreeTrials = async ({
		freeTrialIds,
		env = "sandbox",
		orgId = seeded.ids.orgId,
	}: {
		freeTrialIds: string[];
		env?: string;
		orgId?: string;
	}) => {
		const envelope = await getCatalogRows({
			ctx: { db: postgres.db, orgId, env },
			ids: { ...noOtherIds, freeTrialIds },
		});
		return envelope.free_trials;
	};

	test("the row carries every free_trials column as stored, plus its product's org and env", async () => {
		const { ids } = seeded;
		const [row] = await readFreeTrials({ freeTrialIds: [ids.customTrial] });

		expect(row).toEqual({
			id: ids.customTrial,
			created_at: 1_700_000_000_000,
			internal_product_id: ids.sandboxProduct,
			duration: FreeTrialDuration.Day,
			length: 7,
			unique_fingerprint: false,
			is_custom: true,
			card_required: true,
			on_end: "revert",
			org_id: ids.orgId,
			env: "sandbox",
		});
	});

	test("one lookup serves many trials in id order, scoped to the org and env of the product", async () => {
		const { ids } = seeded;
		const everyId = [
			ids.otherOrgTrial,
			ids.liveTrial,
			ids.customTrial,
			ids.sandboxTrial,
			"ft_does_not_exist",
		];

		const sandbox = await readFreeTrials({ freeTrialIds: everyId });
		const live = await readFreeTrials({ freeTrialIds: everyId, env: "live" });
		const otherOrg = await readFreeTrials({
			freeTrialIds: everyId,
			orgId: ids.otherOrgId,
		});

		expect(sandbox.map(({ id }) => id)).toEqual([
			ids.sandboxTrial,
			ids.customTrial,
		]);
		expect(live.map(({ id }) => id)).toEqual([ids.liveTrial]);
		expect(otherOrg.map(({ id }) => id)).toEqual([ids.otherOrgTrial]);
	});

	test("free trials come back beside the other tables in the same statement", async () => {
		const { ids } = seeded;
		const envelope = await getCatalogRows({
			ctx: { db: postgres.db, orgId: ids.orgId, env: "sandbox" },
			ids: {
				...noOtherIds,
				productInternalIds: [ids.sandboxProduct],
				freeTrialIds: [ids.sandboxTrial],
			},
		});

		expect({
			products: envelope.products.map(({ internal_id }) => internal_id),
			freeTrials: envelope.free_trials.map(({ id }) => id),
		}).toEqual({
			products: [ids.sandboxProduct],
			freeTrials: [ids.sandboxTrial],
		});
	});
});
