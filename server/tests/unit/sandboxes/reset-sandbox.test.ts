import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AppEnv, ErrCode, type Migration, RecaseError } from "@autumn/shared";

/** Every delete the reset performs, in the order it performed them. */
const calls: string[] = [];

await mockModuleWithRestore(
	"@/external/redis/actions/productsCache/productsCache.js",
	() => ({
		invalidateProductsCache: async () => {
			calls.push("cache:products");
		},
	}),
);
await mockModuleWithRestore(
	"@/external/redis/actions/orgWithFeaturesCache/orgWithFeaturesCache.js",
	() => ({
		clearOrgWithFeaturesCache: async () => {
			calls.push("cache:org");
		},
	}),
);

import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { CusService } from "@/internal/customers/CusService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { migrationRepo } from "@/internal/migrations/v2/repos/index.js";
import { ProductService } from "@/internal/products/ProductService.js";
import { resetSandbox } from "@/internal/sandboxes/resetSandbox.js";
import { mockModuleWithRestore } from "../utils/mockModuleWithRestore.js";

const draft = ({ id }: { id: string }): Migration => ({ id }) as Migration;

const contextFor = ({ env }: { env: AppEnv }): AutumnContext =>
	({
		db: {},
		org: { id: "org_sandbox" },
		env,
		logger: { info: () => {}, warn: () => {}, error: () => {} },
	}) as unknown as AutumnContext;

const runHistoryRefusal = ({ id }: { id: string }): RecaseError =>
	new RecaseError({
		message: `Migration ${id} has customer run history and cannot be deleted. Archive it instead.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});

const spies: { mockRestore: () => void }[] = [];

const stubDeletes = ({
	drafts = [] as Migration[],
	refuses = [] as string[],
} = {}) => {
	spies.push(
		spyOn(migrationRepo, "get").mockImplementation(async () => drafts),
		spyOn(migrationRepo, "delete").mockImplementation(async ({ id }) => {
			if (refuses.includes(id)) throw runHistoryRefusal({ id });
			calls.push(`migration:${id}`);
			return draft({ id });
		}),
		spyOn(CusService, "safeDeleteByOrgId").mockImplementation(async () => {
			calls.push("customers");
		}),
		spyOn(ProductService, "safeDeleteByOrgId").mockImplementation(async () => {
			calls.push("products");
		}),
		spyOn(FeatureService, "safeDeleteByOrgId").mockImplementation(async () => {
			calls.push("features");
		}),
	);
};

beforeEach(() => {
	calls.length = 0;
});

afterEach(() => {
	for (const spy of spies.splice(0)) spy.mockRestore();
});

describe("resetSandbox (sandbox-only, drafts before the catalog)", () => {
	test("refuses a live environment with a 400, and deletes nothing", async () => {
		stubDeletes({ drafts: [draft({ id: "mig_1" })] });

		await expect(
			resetSandbox({ ctx: contextFor({ env: AppEnv.Live }) }),
		).rejects.toMatchObject({
			code: ErrCode.InvalidRequest,
			statusCode: 400,
			message: "Only sandboxes can be reset",
		});
		expect(calls).toEqual([]);
	});

	test("deletes drafts first, then customers, products and features", async () => {
		stubDeletes({ drafts: [draft({ id: "mig_1" }), draft({ id: "mig_2" })] });

		await resetSandbox({ ctx: contextFor({ env: AppEnv.Sandbox }) });

		expect(calls).toEqual([
			"migration:mig_1",
			"migration:mig_2",
			"customers",
			"products",
			"features",
			"cache:products",
			"cache:org",
		]);
	});

	test("skips a draft with customer run history and finishes the rest", async () => {
		stubDeletes({
			drafts: [
				draft({ id: "mig_1" }),
				draft({ id: "mig_ran" }),
				draft({ id: "mig_2" }),
			],
			refuses: ["mig_ran"],
		});

		await resetSandbox({ ctx: contextFor({ env: AppEnv.Sandbox }) });

		expect(calls).toEqual([
			"migration:mig_1",
			"migration:mig_2",
			"customers",
			"products",
			"features",
			"cache:products",
			"cache:org",
		]);
	});

	test("only non-archived migrations are asked for", async () => {
		stubDeletes();

		await resetSandbox({ ctx: contextFor({ env: AppEnv.Sandbox }) });

		expect(migrationRepo.get).toHaveBeenCalledWith(
			expect.objectContaining({ archived: false }),
		);
	});
});
