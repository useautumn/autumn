/**
 * invoices.list (InvoiceService.getCursorPage) scoped by invoices.org_id/env.
 *
 * Contract:
 *   org-wide list                → only this org+env's invoices, newest first
 *   customer_id / entity_id      → narrowed to that customer / entity
 *   status / processor_types     → filters still apply (NULL processor counts as stripe)
 *   start_cursor                 → pages walk every row exactly once
 *   other org / other env        → never listed
 *   invoice stamped for another org (customer in this org) → not listed: both tenancy guards must agree
 *   invoice stamped for another env (customer in this env) → listed in neither env
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	AppEnv,
	customers,
	entities,
	InvoiceStatus,
	invoices,
	ListInvoicesParamsSchema,
	type Organization,
	organizations,
	ProcessorType,
} from "@autumn/shared";
import defaultCtx from "@tests/utils/testInitUtils/createTestContext";
import chalk from "chalk";
import { inArray } from "drizzle-orm";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { InvoiceService } from "@/internal/invoices/InvoiceService";
import { OrgService } from "@/internal/orgs/OrgService";
import { generateId } from "@/utils/genUtils";

const runTag = crypto.randomUUID().slice(0, 8);
const BASE_TS = 1_800_000_000_000;

type SeededInvoice = {
	key: string;
	internalCustomerId: string;
	orgId: string;
	env: AppEnv;
	status?: InvoiceStatus;
	processorType?: ProcessorType | null;
	internalEntityId?: string | null;
};

let orgA: Organization;
let orgB: Organization;
const ids = {
	c1: generateId("cus"),
	c2: generateId("cus"),
	cLive: generateId("cus"),
	cOtherOrg: generateId("cus"),
	e1: generateId("ety"),
};
const invoiceIdByKey = new Map<string, string>();

const insertOrg = async ({ name }: { name: string }) => {
	const orgId = generateId("org");
	await defaultCtx.db.insert(organizations).values({
		id: orgId,
		slug: `${name}-${runTag}-${crypto.randomUUID()}`,
		name,
		createdAt: new Date(),
		created_at: Date.now(),
		is_sandbox: false,
		stripe_connected: false,
		default_currency: "usd",
		onboarded: true,
	});
	return OrgService.get({ db: defaultCtx.db, orgId });
};

const listPage = async ({
	org,
	env,
	query,
}: {
	org: Organization;
	env: AppEnv;
	query: Record<string, unknown>;
}) =>
	InvoiceService.getCursorPage({
		ctx: { ...defaultCtx, org, env } as AutumnContext,
		query: ListInvoicesParamsSchema.parse(query),
	});

const keysOf = (rows: { invoice: { id: string } }[]) => {
	const keyById = new Map(
		[...invoiceIdByKey].map(([key, id]) => [id, key] as const),
	);
	return rows.map((row) => keyById.get(row.invoice.id));
};

beforeAll(async () => {
	orgA = await insertOrg({ name: "inv-scope-a" });
	orgB = await insertOrg({ name: "inv-scope-b" });

	await defaultCtx.db.insert(customers).values([
		{
			internal_id: ids.c1,
			id: `c1-${runTag}`,
			org_id: orgA.id,
			env: AppEnv.Sandbox,
			created_at: BASE_TS,
		},
		{
			internal_id: ids.c2,
			id: `c2-${runTag}`,
			org_id: orgA.id,
			env: AppEnv.Sandbox,
			created_at: BASE_TS,
		},
		{
			internal_id: ids.cLive,
			id: `c1-${runTag}`,
			org_id: orgA.id,
			env: AppEnv.Live,
			created_at: BASE_TS,
		},
		{
			internal_id: ids.cOtherOrg,
			id: `c1-${runTag}`,
			org_id: orgB.id,
			env: AppEnv.Sandbox,
			created_at: BASE_TS,
		},
	]);
	await defaultCtx.db.insert(entities).values({
		internal_id: ids.e1,
		id: `e1-${runTag}`,
		org_id: orgA.id,
		env: AppEnv.Sandbox,
		internal_customer_id: ids.c1,
		created_at: BASE_TS,
	});

	const sandboxA = { orgId: orgA.id, env: AppEnv.Sandbox };
	// Listed newest first, so a1 (highest created_at) comes first.
	const seeded: SeededInvoice[] = [
		{ key: "a1", internalCustomerId: ids.c1, ...sandboxA },
		{ key: "a2", internalCustomerId: ids.c2, ...sandboxA },
		{
			key: "a3",
			internalCustomerId: ids.c1,
			...sandboxA,
			status: InvoiceStatus.Open,
		},
		{
			key: "a4",
			internalCustomerId: ids.c1,
			...sandboxA,
			processorType: ProcessorType.RevenueCat,
		},
		{ key: "a5", internalCustomerId: ids.c2, ...sandboxA, processorType: null },
		{
			key: "a6",
			internalCustomerId: ids.c1,
			...sandboxA,
			internalEntityId: ids.e1,
		},
		{ key: "a7", internalCustomerId: ids.c2, ...sandboxA },
		{
			key: "live",
			internalCustomerId: ids.cLive,
			orgId: orgA.id,
			env: AppEnv.Live,
		},
		{
			key: "otherOrg",
			internalCustomerId: ids.cOtherOrg,
			orgId: orgB.id,
			env: AppEnv.Sandbox,
		},
		{
			key: "foreignStamp",
			internalCustomerId: ids.c1,
			orgId: orgB.id,
			env: AppEnv.Sandbox,
		},
		{
			key: "foreignEnv",
			internalCustomerId: ids.c1,
			orgId: orgA.id,
			env: AppEnv.Live,
		},
	];
	await defaultCtx.db.insert(invoices).values(
		seeded.map((row, index) => {
			const id = generateId("inv");
			invoiceIdByKey.set(row.key, id);
			return {
				id,
				created_at: BASE_TS - index * 1000,
				internal_customer_id: row.internalCustomerId,
				internal_entity_id: row.internalEntityId ?? null,
				org_id: row.orgId,
				env: row.env,
				stripe_id: `in_scope_${runTag}_${row.key}`,
				processor_type:
					row.processorType === undefined
						? ProcessorType.Stripe
						: row.processorType,
				status: row.status ?? InvoiceStatus.Paid,
				total: 10,
				currency: "usd",
			};
		}),
	);
});

afterAll(async () => {
	if (!orgA || !orgB) return;
	await defaultCtx.db
		.delete(organizations)
		.where(inArray(organizations.id, [orgA.id, orgB.id]));
});

describe(
	chalk.yellowBright("invoices.list scoped by invoices.org_id/env"),
	() => {
		test("org-wide list returns only this org and env, newest first", async () => {
			const { rows, nextCursor } = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: {},
			});
			expect(keysOf(rows)).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
			expect(nextCursor).toBeNull();
		});

		test("an invoice stamped for another org is not listed even though its customer is in this org", async () => {
			const { rows } = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { customer_id: `c1-${runTag}` },
			});
			expect(keysOf(rows)).not.toContain("foreignStamp");

			const otherOrg = await listPage({
				org: orgB,
				env: AppEnv.Sandbox,
				query: {},
			});
			expect(keysOf(otherOrg.rows)).toEqual(["otherOrg"]);
		});

		test("other env is isolated", async () => {
			const { rows } = await listPage({
				org: orgA,
				env: AppEnv.Live,
				query: {},
			});
			expect(keysOf(rows)).toEqual(["live"]);
		});

		test("an invoice stamped for another env is listed in neither env", async () => {
			const sandbox = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { customer_id: `c1-${runTag}` },
			});
			expect(keysOf(sandbox.rows)).not.toContain("foreignEnv");

			const live = await listPage({ org: orgA, env: AppEnv.Live, query: {} });
			expect(keysOf(live.rows)).not.toContain("foreignEnv");
		});

		test("customer_id and entity_id narrow the list", async () => {
			const byCustomer = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { customer_id: `c2-${runTag}` },
			});
			expect(keysOf(byCustomer.rows)).toEqual(["a2", "a5", "a7"]);

			const byEntity = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { customer_id: `c1-${runTag}`, entity_id: `e1-${runTag}` },
			});
			expect(keysOf(byEntity.rows)).toEqual(["a6"]);
		});

		test("status and processor_types filters still apply; NULL processor counts as stripe", async () => {
			const open = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { status: [InvoiceStatus.Open] },
			});
			expect(keysOf(open.rows)).toEqual(["a3"]);

			const stripe = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { processor_types: [ProcessorType.Stripe] },
			});
			expect(keysOf(stripe.rows)).toEqual(["a1", "a2", "a3", "a5", "a6", "a7"]);

			const revenueCat = await listPage({
				org: orgA,
				env: AppEnv.Sandbox,
				query: { processor_types: [ProcessorType.RevenueCat] },
			});
			expect(keysOf(revenueCat.rows)).toEqual(["a4"]);
		});

		test("cursor pagination walks every row exactly once", async () => {
			const seen: (string | undefined)[] = [];
			let cursor: string | null = null;
			let pages = 0;
			do {
				const page: Awaited<ReturnType<typeof listPage>> = await listPage({
					org: orgA,
					env: AppEnv.Sandbox,
					query: { limit: 3, ...(cursor ? { start_cursor: cursor } : {}) },
				});
				seen.push(...keysOf(page.rows));
				cursor = page.nextCursor;
				pages += 1;
			} while (cursor && pages < 10);

			expect(pages).toBe(3);
			expect(seen).toEqual(["a1", "a2", "a3", "a4", "a5", "a6", "a7"]);
		});
	},
);
