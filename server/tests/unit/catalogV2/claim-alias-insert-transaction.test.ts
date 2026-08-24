/**
 * Create-claim must delete the reserved alias and insert the product
 * in one transaction. Separate commits leave both products.id and
 * product_aliases.alias_id equal to the claimed id.
 *
 * Red (current): insert's transaction commits, then delete throws —
 * the insert stays committed.
 * Green (after): delete-then-insert share one tx; a delete failure
 * does not commit the insert.
 */

import { expect, test } from "bun:test";
import { AppEnv, type Product } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import type { UpdateCatalogPlan } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogPlan.js";
import { executeUpsertProducts } from "@/internal/catalogV2/execute/executeUpsertProducts/executeUpsertProducts.js";

const product = {
	id: "pro",
	name: "Claimed",
	org_id: "org_1",
	env: AppEnv.Sandbox,
	internal_id: "prod_1",
	version: 1,
	active: true,
} as Product;

const queryChain = () => {
	const chain: Record<string, unknown> = {};
	chain.from = () => chain;
	chain.where = () => chain;
	chain.limit = async () => [];
	chain.set = () => chain;
	chain.values = () => chain;
	chain.returning = async () => [{ ...product, active: true }];
	return chain;
};

test("create-claim insert rolls back when alias delete fails", async () => {
	const commits: string[] = [];
	const tx = {
		delete: () => ({
			where: async () => {
				throw new Error("delete failed");
			},
		}),
		transaction: async (fn: (client: unknown) => Promise<unknown>) => {
			const result = await fn(tx);
			commits.push("nested");
			return result;
		},
		select: queryChain,
		update: queryChain,
		insert: queryChain,
	};
	const db = {
		delete: () => ({
			where: async () => {
				throw new Error("delete failed");
			},
		}),
		transaction: async (fn: (client: unknown) => Promise<unknown>) => {
			const result = await fn(tx);
			commits.push("commit");
			return result;
		},
		select: queryChain,
		update: queryChain,
		insert: queryChain,
	};

	await expect(
		executeUpsertProducts({
			ctx: {
				db,
				org: { id: "org_1" },
				env: AppEnv.Sandbox,
			} as unknown as AutumnContext,
			updateCatalogPlan: {
				upsertProducts: [
					{
						row: { op: "create", nextFullProduct: product },
						aliasReplacement: { alias_id: "pro", plan_id: "pro_v2" },
					},
				],
			} as unknown as UpdateCatalogPlan,
		}),
	).rejects.toThrow("delete failed");

	expect(commits).toEqual([]);
});
