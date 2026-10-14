import {
	type CreditSchemaItem,
	ErrCode,
	type Feature,
	FeatureType,
	type InvoiceUsageEntry,
	RecaseError,
} from "@autumn/shared";
import { Decimal } from "decimal.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils";

const stableKey = (entry: InvoiceUsageEntry) =>
	`${entry.feature_id}::${JSON.stringify(
		Object.entries(entry.properties ?? {}).sort(([a], [b]) =>
			a.localeCompare(b),
		),
	)}`;

export const usageEntriesToCredits = ({
	creditSystem,
	entries,
}: {
	creditSystem: Feature;
	entries: InvoiceUsageEntry[];
}): number => {
	if (creditSystem.type !== FeatureType.CreditSystem) {
		throw new RecaseError({
			message: `Feature ${creditSystem.id} is not a credit system; pass quantity instead of usage`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const schema: CreditSchemaItem[] = creditSystem.config?.schema ?? [];
	const grouped = new Map<string, InvoiceUsageEntry>();
	for (const entry of entries) {
		const inSchema = schema.some(
			(item) => item.metered_feature_id === entry.feature_id,
		);
		if (!inSchema) {
			throw new RecaseError({
				message: `Feature ${entry.feature_id} is not part of credit system ${creditSystem.id}`,
				code: ErrCode.InvalidRequest,
				statusCode: 400,
			});
		}

		const key = stableKey(entry);
		const existing = grouped.get(key);
		grouped.set(
			key,
			existing
				? { ...existing, quantity: existing.quantity + entry.quantity }
				: entry,
		);
	}

	let credits = new Decimal(0);
	for (const entry of grouped.values()) {
		credits = credits.plus(
			featureToCreditSystem({
				featureId: entry.feature_id,
				creditSystem,
				amount: entry.quantity,
				currentUsage: 0,
				eventProperties: entry.properties,
			}),
		);
	}
	return credits.toNumber();
};
