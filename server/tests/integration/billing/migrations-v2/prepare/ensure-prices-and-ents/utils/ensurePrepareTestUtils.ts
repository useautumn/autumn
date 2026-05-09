import { expect } from "bun:test";
import type { Migration } from "@autumn/shared";
import {
	EnsurePricesAndEntitlementsResultSchema,
	type PreparedArtifactRef,
	type EnsurePricesAndEntitlementsResult,
} from "@/internal/migrations/v2/prepare/modules/ensurePricesAndEntitlements/index.js";
import { prepare } from "@/internal/migrations/v2/prepare/prepare.js";
import type { PreparedState } from "@/internal/migrations/v2/prepare/types/index.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

const prepareKey = "ensure_prices_and_entitlements:update_plan";

export type PreparedMigrationResult = {
	preparedState: PreparedState;
	result: EnsurePricesAndEntitlementsResult;
};

type PreparedResultLike =
	| EnsurePricesAndEntitlementsResult
	| PreparedMigrationResult;

type PreparedArtifactSelector = {
	opIndex: number;
	kind: "base_price" | "add_item";
	itemIndex?: number;
	internalProductId?: string;
};

type PreparedArtifactField =
	| "hash"
	| "price_id"
	| "entitlement_id"
	| "internal_product_id";

const toResult = ({
	prepared,
}: {
	prepared: PreparedResultLike;
}): EnsurePricesAndEntitlementsResult =>
	"artifacts" in prepared ? prepared : prepared.result;

export const extractEnsureResult = ({
	preparedState,
}: {
	preparedState: unknown;
}): EnsurePricesAndEntitlementsResult => {
	const state = preparedState as Record<string, unknown>;
	return EnsurePricesAndEntitlementsResultSchema.parse(state[prepareKey]);
};

export const expectPreparedArtifact = ({
	result,
	opIndex,
	kind,
	itemIndex,
	internalProductId,
}: {
	result: PreparedResultLike;
} & PreparedArtifactSelector): PreparedArtifactRef => {
	const preparedResult = toResult({ prepared: result });
	const artifact = preparedResult.artifacts.find(
		(candidate) =>
			candidate.op_index === opIndex &&
			candidate.kind === kind &&
			candidate.item_index === itemIndex &&
			(internalProductId === undefined ||
				candidate.internal_product_id === internalProductId),
	);
	expect(artifact).toBeDefined();
	return artifact!;
};

export const expectPreparedArtifactFieldsStable = ({
	before,
	after,
	artifact,
	fields,
}: {
	before: PreparedResultLike;
	after: PreparedResultLike;
	artifact: PreparedArtifactSelector;
	fields: PreparedArtifactField[];
}) => {
	const beforeArtifact = expectPreparedArtifact({
		result: before,
		...artifact,
	});
	const afterArtifact = expectPreparedArtifact({ result: after, ...artifact });

	for (const field of fields) {
		expect(afterArtifact[field]).toBe(beforeArtifact[field]);
	}
};

export const expectPreparedArtifactFieldsChanged = ({
	before,
	after,
	artifact,
	fields,
}: {
	before: PreparedResultLike;
	after: PreparedResultLike;
	artifact: PreparedArtifactSelector;
	fields: PreparedArtifactField[];
}) => {
	const beforeArtifact = expectPreparedArtifact({
		result: before,
		...artifact,
	});
	const afterArtifact = expectPreparedArtifact({ result: after, ...artifact });

	for (const field of fields) {
		expect(afterArtifact[field]).not.toBe(beforeArtifact[field]);
	}
};

export const expectPreparedArtifactRowIds = ({
	artifact,
}: {
	artifact: PreparedArtifactRef;
}) => {
	const priceId = artifact.price_id;
	const entitlementId = artifact.entitlement_id;
	if (!priceId || !entitlementId) {
		throw new Error(
			"Expected prepared artifact to include price and entitlement IDs",
		);
	}

	return { priceId, entitlementId };
};

export const expectPreparedCatalogContainsRows = ({
	result,
	priceIds = [],
	entitlementIds = [],
}: {
	result: PreparedResultLike;
	priceIds?: string[];
	entitlementIds?: string[];
}) => {
	const preparedResult = toResult({ prepared: result });
	const preparedPriceIds = preparedResult.prices.map((price) => price.id);
	const preparedEntitlementIds = preparedResult.entitlements.map(
		(entitlement) => entitlement.id,
	);

	for (const priceId of priceIds) {
		expect(preparedPriceIds).toContain(priceId);
	}
	for (const entitlementId of entitlementIds) {
		expect(preparedEntitlementIds).toContain(entitlementId);
	}
};

export const prepareMigration = async ({
	ctx,
	migration,
	dryRun = false,
}: {
	ctx: AutumnContext;
	migration: Migration;
	dryRun?: boolean;
}): Promise<PreparedMigrationResult> => {
	const { preparedState } = await prepare({ ctx, migration, dryRun });
	return {
		preparedState,
		result: extractEnsureResult({ preparedState }),
	};
};
