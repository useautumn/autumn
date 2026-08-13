import { describe, expect, test } from "bun:test";
import type { FullProduct, RewardProgram } from "@autumn/shared";
import { products } from "@tests/utils/fixtures/db/products";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { buildProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/buildProductStatesContext";
import { projectProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/projectProductStatesContext";
import type { CustomerProductVersioningUsage } from "@/internal/customers/cusProducts/repos/getVersioningUsage.js";

const usage = (
	overrides: Partial<CustomerProductVersioningUsage> = {},
): CustomerProductVersioningUsage => ({
	hasAnyCustomerProducts: false,
	hasVersionableCustomerProducts: false,
	versionableCustomerCount: 0,
	hasVersionableRowRefs: false,
	...overrides,
});

const contextFor = ({
	rows,
	usageByInternalId = new Map(),
	rewardProgramsByPlanId = new Map(),
}: {
	rows: FullProduct[];
	usageByInternalId?: Map<string, CustomerProductVersioningUsage>;
	rewardProgramsByPlanId?: Map<string, RewardProgram[]>;
}): ProductStatesContext => {
	const versionsByPlanId = new Map<string, FullProduct[]>();
	for (const row of rows) {
		versionsByPlanId.set(row.id, [
			...(versionsByPlanId.get(row.id) ?? []),
			row,
		]);
	}
	return buildProductStatesContext({
		planIds: [...versionsByPlanId.keys()],
		versionsByPlanId,
		usageByInternalId,
		rewardProgramsByPlanId,
	});
};

const updateUpsert = ({
	current,
	next,
}: {
	current: FullProduct;
	next: FullProduct;
}): UpsertProductPlan => ({
	row: {
		planId: next.id,
		version: next.version,
		op: "update",
		source: "direct",
		versioning: "existing",
		currentFullProduct: current,
		baseFullProduct: null,
		nextFullProduct: next,
	},
	state: { hasCustomers: false },
});

const createUpsert = ({ next }: { next: FullProduct }): UpsertProductPlan => ({
	row: {
		planId: next.id,
		version: next.version,
		op: "create",
		source: "direct",
		versioning: "existing",
		currentFullProduct: null,
		baseFullProduct: null,
		nextFullProduct: next,
	},
	state: { hasCustomers: false },
});

describe("projectProductStatesContext", () => {
	test("update swaps the row by internal_id", () => {
		const pro = products.createFull({ id: "pro" });
		const original = contextFor({ rows: [pro] });

		const projected = projectProductStatesContext({
			original,
			upsertProducts: [
				updateUpsert({ current: pro, next: { ...pro, name: "Pro v2" } }),
			],
		});

		expect(projected.statesByPlanVersion["pro@1"].currentFullProduct.name).toBe(
			"Pro v2",
		);
		expect(projected.versionsByPlanId.pro[0].name).toBe("Pro v2");
	});

	test("create inserts a new plan version", () => {
		const pro = products.createFull({ id: "pro" });
		const original = contextFor({ rows: [pro] });

		const starter = products.createFull({ id: "starter" });
		const projected = projectProductStatesContext({
			original,
			upsertProducts: [createUpsert({ next: starter })],
		});

		expect(projected.versionsByPlanId.starter).toHaveLength(1);
		expect(
			projected.statesByPlanVersion["starter@1"].currentFullProduct.id,
		).toBe("starter");
		expect(projected.versionsByPlanId.pro).toHaveLength(1);
	});

	test("id patch re-keys the plan; old key stays present but empty", () => {
		const pro = products.createFull({ id: "pro" });
		const program = { id: "rp_1" } as unknown as RewardProgram;
		const original = contextFor({
			rows: [pro],
			rewardProgramsByPlanId: new Map([["pro", [program]]]),
		});

		const projected = projectProductStatesContext({
			original,
			upsertProducts: [
				updateUpsert({ current: pro, next: { ...pro, id: "pro_v2" } }),
			],
		});

		expect(projected.versionsByPlanId.pro_v2).toHaveLength(1);
		expect(projected.versionsByPlanId.pro).toHaveLength(0);
		expect(projected.statesByPlanVersion["pro_v2@1"]).toBeDefined();
		expect(projected.statesByPlanVersion["pro@1"]).toBeUndefined();
		expect(projected.rewardProgramsByPlanId.pro_v2).toEqual([program]);
	});

	test("customerUsage carries by internal_id through an update", () => {
		const pro = products.createFull({ id: "pro" });
		const original = contextFor({
			rows: [pro],
			usageByInternalId: new Map([
				[pro.internal_id, usage({ hasAnyCustomerProducts: true })],
			]),
		});

		const projected = projectProductStatesContext({
			original,
			upsertProducts: [
				updateUpsert({ current: pro, next: { ...pro, name: "Renamed" } }),
			],
		});

		expect(
			projected.statesByPlanVersion["pro@1"].customerUsage
				.hasAnyCustomerProducts,
		).toBe(true);
	});
});
