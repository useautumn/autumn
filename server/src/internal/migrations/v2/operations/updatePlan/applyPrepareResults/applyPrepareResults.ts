import type { AutumnBillingPlan } from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import type { ReusePricesAndEntitlements } from "@/internal/billing/v2/setup/patch/index.js";
import {
	EnsurePricesAndEntitlementsResultSchema,
	type EnsurePricesAndEntitlementsResult,
	type PreparedArtifactRef,
} from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/index.js";
import { buildPrepareModuleKey } from "@/internal/migrations/v2/prepare/utils/index.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import { MigrationOperationError } from "../../errors/index.js";
import type { MigrateCustomerContext } from "../../types/index.js";

export type PreparedUpdatePlanArtifactIds = {
	priceIds: Set<string>;
	entitlementIds: Set<string>;
};

export const stripPreparedCatalogRows = ({
	plan,
	preparedIds,
}: {
	plan: AutumnBillingPlan;
	preparedIds: PreparedUpdatePlanArtifactIds;
}): AutumnBillingPlan => ({
	...plan,
	customPrices: plan.customPrices?.filter(
		(price) => !preparedIds.priceIds.has(price.id),
	),
	customEntitlements: plan.customEntitlements?.filter(
		(entitlement) => !preparedIds.entitlementIds.has(entitlement.id),
	),
});

const ensurePricesAndEntitlementsKey = buildPrepareModuleKey({
	kind: "ensure_prices_and_entitlements",
	parts: ["update_plan"],
});

const getPreparedArtifacts = ({
	context,
}: {
	context: MigrateCustomerContext;
}): EnsurePricesAndEntitlementsResult => {
	const preparedState =
		context.migration.prepared_state?.[ensurePricesAndEntitlementsKey];
	const result =
		EnsurePricesAndEntitlementsResultSchema.safeParse(preparedState);

	if (!result.success) {
		throw new MigrationOperationError({
			code: "missing_prepared_state",
			operationType: "update_plan",
			field: "prepared_state",
			message:
				"Migration update_plan requires prepared prices and entitlements. Run prepare before migrating customers.",
			details: { prepareKey: ensurePricesAndEntitlementsKey },
		});
	}

	return result.data;
};

const findArtifact = ({
	artifacts,
	opIndex,
	kind,
	itemIndex,
	hash,
	internalProductId,
}: {
	artifacts: PreparedArtifactRef[];
	opIndex: number;
	kind: PreparedArtifactRef["kind"];
	itemIndex?: number;
	hash: string;
	internalProductId: string;
}) => {
	const artifact = artifacts.find(
		(candidate) =>
			candidate.op_index === opIndex &&
			candidate.kind === kind &&
			candidate.item_index === itemIndex &&
			candidate.internal_product_id === internalProductId &&
			candidate.hash === hash,
	);

	if (!artifact) {
		throw new MigrationOperationError({
			code: "missing_prepared_state",
			operationType: "update_plan",
			field: "prepared_state",
			message:
				"Migration update_plan prepared_state is missing an artifact for the current operation input.",
			details: { opIndex, kind, itemIndex, internalProductId, hash },
		});
	}

	return artifact;
};

const addPreparedId = ({
	ids,
	artifact,
	reusePricesAndEntitlements,
}: {
	ids: PreparedUpdatePlanArtifactIds;
	artifact: PreparedArtifactRef;
	reusePricesAndEntitlements: ReusePricesAndEntitlements;
}) => {
	if (artifact.price_id) {
		if (!reusePricesAndEntitlements.pricesById.has(artifact.price_id)) {
			throw new MigrationOperationError({
				code: "missing_prepared_state",
				operationType: "update_plan",
				field: "prepared_state",
				message:
					"Migration update_plan prepared_state references a missing prepared price.",
				details: { priceId: artifact.price_id },
			});
		}
		ids.priceIds.add(artifact.price_id);
	}
	if (artifact.entitlement_id) {
		if (
			!reusePricesAndEntitlements.entitlementsById.has(artifact.entitlement_id)
		) {
			throw new MigrationOperationError({
				code: "missing_prepared_state",
				operationType: "update_plan",
				field: "prepared_state",
				message:
					"Migration update_plan prepared_state references a missing prepared entitlement.",
				details: { entitlementId: artifact.entitlement_id },
			});
		}
		ids.entitlementIds.add(artifact.entitlement_id);
	}
};

export const applyPrepareResultsToUpdatePlan = ({
	context,
	op,
	opIndex,
	internalProductId,
}: {
	context: MigrateCustomerContext;
	op: UpdatePlanOp;
	opIndex: number;
	internalProductId: string;
}): {
	op: UpdatePlanOp;
	preparedIds: PreparedUpdatePlanArtifactIds;
	reusePricesAndEntitlements: ReusePricesAndEntitlements;
} => {
	const preparedIds: PreparedUpdatePlanArtifactIds = {
		priceIds: new Set(),
		entitlementIds: new Set(),
	};
	const emptyReusableRows: ReusePricesAndEntitlements = {
		pricesById: new Map(),
		entitlementsById: new Map(),
	};

	const customize = op.customize;
	const needsPreparedArtifacts =
		(customize?.price !== undefined && customize.price !== null) ||
		(customize?.add_items?.length ?? 0) > 0;

	if (!customize || !needsPreparedArtifacts) {
		return {
			op,
			preparedIds,
			reusePricesAndEntitlements: emptyReusableRows,
		};
	}

	const preparedResult = getPreparedArtifacts({ context });
	const artifacts = preparedResult.artifacts;
	const reusePricesAndEntitlements: ReusePricesAndEntitlements = {
		pricesById: new Map(
			preparedResult.prices.map((price) => [price.id, price]),
		),
		entitlementsById: new Map(
			preparedResult.entitlements.map((entitlement) => [
				entitlement.id,
				entitlement,
			]),
		),
	};
	const nextCustomize = { ...customize };

	if (customize.price !== undefined && customize.price !== null) {
		const artifact = findArtifact({
			artifacts,
			opIndex,
			kind: "base_price",
			internalProductId,
			hash: hashJson({ value: customize.price }),
		});
		addPreparedId({ ids: preparedIds, artifact, reusePricesAndEntitlements });
		nextCustomize.price = {
			...customize.price,
			...(artifact.price_id ? { price_id: artifact.price_id } : {}),
		};
	}

	if (customize.add_items) {
		nextCustomize.add_items = customize.add_items.map((item, itemIndex) => {
			const artifact = findArtifact({
				artifacts,
				opIndex,
				kind: "add_item",
				itemIndex,
				internalProductId,
				hash: hashJson({ value: item }),
			});
			addPreparedId({
				ids: preparedIds,
				artifact,
				reusePricesAndEntitlements,
			});
			return {
				...item,
				...(artifact.price_id ? { price_id: artifact.price_id } : {}),
				...(artifact.entitlement_id
					? { entitlement_id: artifact.entitlement_id }
					: {}),
			};
		});
	}

	return {
		op: {
			...op,
			customize: nextCustomize,
		},
		preparedIds,
		reusePricesAndEntitlements,
	};
};
