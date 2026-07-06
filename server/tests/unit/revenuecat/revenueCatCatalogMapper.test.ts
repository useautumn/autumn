import { afterEach, describe, expect, spyOn, test } from "bun:test";

const { RCMappingService } = await import(
	"../../../src/external/revenueCat/misc/RCMappingService.js"
);
const { mapRevenueCatProductToAutumn } = await import(
	"../../../src/external/revenueCat/misc/revenueCatCatalogMapper.js"
);

// rcCli stub: only listAllProducts is exercised by the mapper.
const rcCliStub = (products: { id: string; store_identifier: string }[]) =>
	({
		listAllProducts: () => Promise.resolve(products),
	}) as never;

const fakeDb = {} as never;

afterEach(() => {
	// Reset the module-level catalog cache between tests via a fresh org key.
});

describe("revenueCatCatalogMapper", () => {
	test("resolves RC-internal product_id -> store_identifier -> autumn product", async () => {
		const spy = spyOn(
			RCMappingService,
			"getAutumnProductId",
		).mockResolvedValue("autumn_pro");

		const result = await mapRevenueCatProductToAutumn({
			db: fakeDb,
			orgId: "org_a",
			env: "live" as never,
			revenueCatInternalProductId: "prod_internal_1",
			rcCli: rcCliStub([
				{ id: "prod_internal_1", store_identifier: "autumn.live.pro" },
			]),
		});

		expect(result).toBe("autumn_pro");
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy.mock.calls[0][0]).toMatchObject({
			orgId: "org_a",
			revenuecatProductId: "autumn.live.pro",
		});
		spy.mockRestore();
	});

	test("returns null when the RC-internal id is not in the catalog", async () => {
		const spy = spyOn(
			RCMappingService,
			"getAutumnProductId",
		).mockResolvedValue("autumn_pro");

		const result = await mapRevenueCatProductToAutumn({
			db: fakeDb,
			orgId: "org_b",
			env: "live" as never,
			revenueCatInternalProductId: "prod_missing",
			rcCli: rcCliStub([
				{ id: "prod_internal_1", store_identifier: "autumn.live.pro" },
			]),
		});

		expect(result).toBeNull();
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
	});
});
