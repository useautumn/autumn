import { type Feature, formatAmount } from "@autumn/shared";
import type { MigrationWithRunInfo } from "@/hooks/queries/useMigrationsQuery";
import { getFeatureIconConfig } from "@/views/products/features/utils/getFeatureIcon";
import type { MigrationCatalog } from "./chipView";
import { deriveFilterView, type FilterView } from "./filterView";
import { deriveOperationsView, type OperationsView } from "./operationsView";
import { deriveStatusView, type StatusView } from "./statusView";

export type MigrationRowView = {
	filter: FilterView | null;
	operations: OperationsView | null;
	status: StatusView;
	customerCount: number | null;
};

export type MigrationListRow = MigrationWithRunInfo & {
	view: MigrationRowView;
};

export const createMigrationCatalog = ({
	products,
	features,
	currency,
}: {
	products: { id: string; name: string | null }[];
	features: Feature[];
	currency: string;
}): MigrationCatalog => {
	const planNames = new Map(
		products.map((product) => [product.id, product.name ?? product.id]),
	);
	const featuresById = new Map(
		features.map((feature) => [feature.id, feature]),
	);
	return {
		planName: (planId) => planNames.get(planId) ?? planId,
		feature: (featureId) => {
			const feature = featuresById.get(featureId);
			const { tone, glyph } = getFeatureIconConfig(
				feature?.type,
				feature?.config?.usage_type,
			);
			return { name: feature?.name ?? featureId, tile: { tone, glyph } };
		},
		formatAmount: (amount) =>
			formatAmount({
				currency,
				amount,
				amountFormatOptions: { currencyDisplay: "narrowSymbol" },
			}),
	};
};

/** The one place a list row's filter, operations and run state become display data. */
const deriveMigrationRowView = ({
	migration,
	catalog,
	now,
}: {
	migration: MigrationWithRunInfo;
	catalog: MigrationCatalog;
	now: number;
}): MigrationRowView => {
	const { summary } = migration;
	return {
		filter: deriveFilterView({ filter: migration.filter, catalog }),
		operations: deriveOperationsView({
			operations: migration.operations,
			noBillingChanges: migration.no_billing_changes,
			catalog,
		}),
		status: deriveStatusView({ status: migration.status, summary, now }),
		customerCount: summary.customer_count,
	};
};

export const toMigrationListRows = ({
	migrations,
	catalog,
	now,
}: {
	migrations: MigrationWithRunInfo[];
	catalog: MigrationCatalog;
	now: number;
}): MigrationListRow[] =>
	migrations.map((migration) => ({
		...migration,
		view: deriveMigrationRowView({ migration, catalog, now }),
	}));
