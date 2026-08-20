import { ErrCode, RecaseError } from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { ProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";
import type { UpsertProductPlan } from "@/internal/catalogV2/actions/updateCatalog/types/upsertProductPlan";
import { activeFullProductForPlan } from "@/internal/catalogV2/actions/updateCatalog/utils/productStateUtils/activeFullProductForPlan";

const latestOrPinned = ({
	planId,
	version,
	productStatesContext,
}: {
	planId: string;
	version?: number;
	productStatesContext: ProductStatesContext;
}) => {
	const versions = productStatesContext.versionsByPlanId[planId] ?? [];
	if (version !== undefined) {
		return versions.find((product) => product.version === version);
	}
	return activeFullProductForPlan({ planId, productStatesContext }) ?? undefined;
};

const rejectArchivedPropagateTarget = ({
	planId,
}: {
	planId: string;
}): never => {
	throw new RecaseError({
		message: `Cannot propagate to archived plan ${planId}`,
		code: ErrCode.InvalidPropagationTarget,
		statusCode: StatusCodes.BAD_REQUEST,
	});
};

/** Archived relatives stay pinned — they cannot be named in propagate. */
export const handleArchivedPropagationErrors = ({
	upsert,
	productStatesContext,
}: {
	upsert: UpsertProductPlan;
	productStatesContext: ProductStatesContext;
}): void => {
	for (const target of [
		...(upsert.propagate?.variants ?? []),
		...(upsert.propagate?.license_parents ?? []),
	]) {
		const product = latestOrPinned({
			planId: target.plan_id,
			version: target.version,
			productStatesContext,
		});
		if (product?.archived) {
			rejectArchivedPropagateTarget({ planId: target.plan_id });
		}
	}

	for (const variant of upsert.declaredVariants ?? []) {
		if (variant.archived === false) continue;
		if (!variant.customize) continue;
		const product = latestOrPinned({
			planId: variant.variant_plan_id,
			version: variant.version,
			productStatesContext,
		});
		if (product?.archived) {
			throw new RecaseError({
				message: `Cannot customize archived variant ${variant.variant_plan_id}. Pass archived: false to unarchive it first.`,
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}
	}
};
