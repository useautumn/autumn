import { expect, mock, test } from "bun:test";
import type { FullProduct, ProductItem } from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

let receivedDb: DrizzleCli | undefined;
const simulatedWriteFailure = new Error("simulated write failure");
const handleNewProductItemsMock = mock(async ({ db }: { db: DrizzleCli }) => {
	receivedDb = db;
	throw simulatedWriteFailure;
});

mock.module(
	"@/internal/products/product-items/productItemUtils/handleNewProductItems.js",
	() => ({ handleNewProductItems: handleNewProductItemsMock }),
);

const { updateProductItems } = await import(
	"@/internal/product/actions/updateProduct/updateProductItems.js"
);

test("plan item updates run the no-customer path in a transaction", async () => {
	const transactionDb = {} as DrizzleCli;
	const db = {
		transaction: async (callback: (transaction: DrizzleCli) => Promise<void>) =>
			callback(transactionDb),
	} as unknown as DrizzleCli;
	const ctx = { org: { config: {} } } as AutumnContext;

	await expect(
		updateProductItems({
			ctx,
			db,
			fullProduct: {
				prices: [],
				entitlements: [],
			} as unknown as FullProduct,
			newItems: [] as ProductItem[],
			features: [],
			useInPlaceEdit: false,
		}),
	).rejects.toBe(simulatedWriteFailure);

	expect(receivedDb).toBe(transactionDb);
});
