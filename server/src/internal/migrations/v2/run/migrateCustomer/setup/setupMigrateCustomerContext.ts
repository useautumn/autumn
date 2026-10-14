import type { FullCustomer } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { setupFullCustomerContext } from "@/internal/billing/v2/setup/setupFullCustomerContext.js";
import { fullCustomerWithDerivedIsCustom } from "@/internal/customers/cusProducts/actions/deriveIsCustom/fullCustomerWithDerivedIsCustom.js";
import type { BaseProductCache } from "@/internal/customers/cusProducts/actions/deriveIsCustom/loadBaseProduct.js";
import type { MigrateCustomerContext } from "@/internal/migrations/v2/operations/types/index.js";
import { createMigrationStripeCache } from "@/internal/migrations/v2/stripeCache/index.js";
import type { MigrationRuntime } from "../../../types/migrationDefinition.js";

const baseProductsByMigration = new WeakMap<
	MigrationRuntime,
	BaseProductCache
>();

const baseProductsForMigration = ({
	migration,
}: {
	migration: MigrationRuntime;
}): BaseProductCache => {
	const cached = baseProductsByMigration.get(migration);
	if (cached) return cached;
	const baseProducts: BaseProductCache = new Map();
	baseProductsByMigration.set(migration, baseProducts);
	return baseProducts;
};

const bumpsVersion = ({ migration }: { migration: MigrationRuntime }) =>
	Boolean(
		migration.operations?.customer?.some(
			(op) => op.type === "update_plan" && op.version !== undefined,
		),
	);

const keepStoredNotCustomFlags = ({
	stored,
	derived,
}: {
	stored: FullCustomer;
	derived: FullCustomer;
}): FullCustomer => ({
	...derived,
	customer_products: derived.customer_products.map(
		(customerProduct, index) => ({
			...customerProduct,
			is_custom:
				customerProduct.is_custom && stored.customer_products[index].is_custom,
		}),
	),
});

export const setupMigrateCustomerContext = async ({
	ctx,
	migration,
	customerId,
	preview,
}: {
	ctx: AutumnContext;
	migration: MigrationRuntime;
	customerId: string;
	preview: boolean;
}): Promise<MigrateCustomerContext> => {
	const storedFullCustomer = await setupFullCustomerContext({
		ctx,
		params: { customer_id: customerId },
	});
	const { fullCustomer: derivedFullCustomer, corrections } =
		await fullCustomerWithDerivedIsCustom({
			ctx,
			fullCustomer: storedFullCustomer,
			baseProducts: baseProductsForMigration({ migration }),
		});
	const fullCustomer = bumpsVersion({ migration })
		? derivedFullCustomer
		: keepStoredNotCustomFlags({
				stored: storedFullCustomer,
				derived: derivedFullCustomer,
			});

	return {
		migration,
		fullCustomer,
		preview,
		isCustomCorrections: corrections,
		stripeCache: createMigrationStripeCache({
			ctx,
			fullCustomer,
			allowStripeCustomerCreation: migration.no_billing_changes !== true,
		}),
	};
};
