import {
	ErrCode,
	type FullProduct,
	findDuplicate,
	type PlanLicenseParams,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	getFullLicenseProduct,
	toApiPlanLicenses,
} from "../../licenseUtils.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

type ResolvedLink = {
	entry: PlanLicenseParams;
	licenseProduct: FullProduct;
	included: number;
	prepaidOnly: boolean;
};

export type PreparedPlanLicenseSync = {
	parentProduct: FullProduct;
	resolved: ResolvedLink[];
	removed: Awaited<
		ReturnType<typeof planLicenseRepo.listCatalogByParentInternalProductIds>
	>;
};

export const validatePlanLicenseUpdate = ({
	allVersions,
	licenses,
}: {
	allVersions?: boolean;
	licenses?: PlanLicenseParams[];
}) => {
	if (allVersions && licenses !== undefined) {
		throw new RecaseError({
			message: "Updating licenses across all plan versions is not supported.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

export const previewPlanLicenseSync = async (
	args: Parameters<typeof preparePlanLicenseSync>[0],
) => {
	const previous = toApiPlanLicenses(args.parentProduct.licenses ?? []);
	const prepared = await preparePlanLicenseSync(args);
	const current = prepared
		? prepared.resolved.map((license) => ({
				license_plan_id: license.licenseProduct.id,
				version: license.licenseProduct.version,
				included: license.included,
				prepaid_only: license.prepaidOnly,
			}))
		: previous;
	const before = new Map(
		previous.map((license) => [license.license_plan_id, license]),
	);
	const after = new Map(
		current.map((license) => [license.license_plan_id, license]),
	);
	const changes = [...new Set([...before.keys(), ...after.keys()])].flatMap(
		(licensePlanId) => {
			const oldLicense = before.get(licensePlanId) ?? null;
			const newLicense = after.get(licensePlanId) ?? null;
			if (JSON.stringify(oldLicense) === JSON.stringify(newLicense)) return [];
			return [
				{
					action: oldLicense ? (newLicense ? "update" : "remove") : "create",
					license_plan_id: licensePlanId,
				} as const,
			];
		},
	);
	return { licenses: current, changes };
};

/** Resolves and validates one link without writing it. */
const resolveLink = async ({
	ctx,
	parentProduct,
	entry,
	licenseProducts,
	pinnedInternalIdByPublicId,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	entry: PlanLicenseParams;
	licenseProducts?: FullProduct[];
	pinnedInternalIdByPublicId: Map<string, string>;
}): Promise<ResolvedLink> => {
	const pinnedInternalId =
		entry.version === undefined
			? pinnedInternalIdByPublicId.get(entry.license_plan_id)
			: undefined;
	const virtualCandidates = licenseProducts
		?.filter(
			(product) =>
				product.id === entry.license_plan_id &&
				(entry.version === undefined || product.version === entry.version),
		)
		.sort((a, b) => b.version - a.version);
	const licenseProduct =
		(pinnedInternalId
			? await getFullLicenseProduct({ ctx, idOrInternalId: pinnedInternalId })
			: virtualCandidates?.[0]) ??
		(await getFullLicenseProduct({
			ctx,
			idOrInternalId: entry.license_plan_id,
			version: entry.version,
		}));

	validateLicenseLink({
		parentProduct,
		licenseProduct,
		prepaidOnly: entry.prepaid_only ?? true,
		licensePlanId: entry.license_plan_id,
	});

	return {
		entry,
		licenseProduct,
		included: entry.included ?? 0,
		prepaidOnly: entry.prepaid_only ?? true,
	};
};

/** A license plan may be offered by only one parent plan lineage. */
const assertLicenseNotOwnedElsewhere = async ({
	ctx,
	parentProduct,
	licensePlanId,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	licensePlanId: string;
}) => {
	const parentPlanIds =
		await planLicenseRepo.listCatalogParentPlanIdsByLicensePlanId({
			db: ctx.db,
			orgId: ctx.org.id,
			env: ctx.env,
			licensePlanId,
		});
	const otherParentId = parentPlanIds.find((id) => id !== parentProduct.id);
	if (otherParentId) {
		throw new RecaseError({
			message: `License plan ${licensePlanId} is already offered by plan ${otherParentId}. A license can be offered by only one plan.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

/** A plan cannot drop below what customers are already using. */
const assertCapacityAllowed = async ({
	ctx,
	parentInternalProductId,
	licenseInternalProductId,
	licensePlanId,
	included,
}: {
	ctx: AutumnContext;
	parentInternalProductId: string;
	licenseInternalProductId: string;
	licensePlanId: string;
	included: number;
}) => {
	const maxAssigned = await licenseAssignmentRepo.maxActiveCountByCatalogLink({
		db: ctx.db,
		parentInternalProductId,
		licenseInternalProductId,
	});
	if (maxAssigned > included) {
		throw new RecaseError({
			message: `Cannot set ${licensePlanId} included to ${included}: a customer has ${maxAssigned} active assignment${maxAssigned === 1 ? "" : "s"}. Unassign ${maxAssigned === 1 ? "it" : "them"} first.`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}
};

/** Resolves and validates the complete desired license list without writing. */
export const preparePlanLicenseSync = async ({
	ctx,
	parentProduct,
	licenses,
	fromInternalProductId = parentProduct.internal_id,
	newParentVersion = false,
	licenseProducts,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	licenses?: PlanLicenseParams[];
	fromInternalProductId?: string;
	newParentVersion?: boolean;
	licenseProducts?: FullProduct[];
}): Promise<PreparedPlanLicenseSync | undefined> => {
	if (licenses === undefined) return undefined;
	const duplicate = findDuplicate(
		licenses.map((license) => license.license_plan_id),
	);
	if (duplicate) {
		throw new RecaseError({
			message: `Duplicate license ${duplicate} in licenses`,
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const sourceLinks =
		await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [fromInternalProductId],
		});
	const existingLinkProducts = await planLicenseRepo.listProductsByInternalIds({
		db: ctx.db,
		internalProductIds: sourceLinks.map(
			(link) => link.license_internal_product_id,
		),
	});
	const pinnedInternalIdByPublicId = new Map(
		existingLinkProducts.map((product) => [product.id, product.internal_id]),
	);
	const resolved = await Promise.all(
		licenses.map((entry) =>
			resolveLink({
				ctx,
				parentProduct,
				entry,
				licenseProducts,
				pinnedInternalIdByPublicId,
			}),
		),
	);
	const newLinks = resolved.filter(
		(link) => !pinnedInternalIdByPublicId.has(link.licenseProduct.id),
	);
	await Promise.all(
		newLinks.map((link) =>
			assertLicenseNotOwnedElsewhere({
				ctx,
				parentProduct,
				licensePlanId: link.licenseProduct.id,
			}),
		),
	);
	const keepInternalIds = new Set(
		resolved.map((link) => link.licenseProduct.internal_id),
	);

	// Removals + capacity reductions must clear the active-assignment guard.
	const existingLinks = newParentVersion ? [] : sourceLinks;
	const removed = existingLinks.filter(
		(link) => !keepInternalIds.has(link.license_internal_product_id),
	);
	await Promise.all(
		removed.map(async (link) => {
			const licenseProduct = await getFullLicenseProduct({
				ctx,
				idOrInternalId: link.license_internal_product_id,
			});
			await assertCapacityAllowed({
				ctx,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: link.license_internal_product_id,
				licensePlanId: licenseProduct.id,
				included: 0,
			});
		}),
	);
	const reducedLinks = resolved.filter((link) => {
		const existing = existingLinks.find(
			(row) =>
				row.license_internal_product_id === link.licenseProduct.internal_id,
		);
		return existing !== undefined && link.included < existing.included;
	});
	await Promise.all(
		reducedLinks.map((link) =>
			assertCapacityAllowed({
				ctx,
				parentInternalProductId: parentProduct.internal_id,
				licenseInternalProductId: link.licenseProduct.internal_id,
				licensePlanId: link.licenseProduct.id,
				included: link.included,
			}),
		),
	);

	return { parentProduct, resolved, removed };
};

export const applyPreparedPlanLicenseSync = async ({
	ctx,
	prepared,
	parentInternalProductId = prepared.parentProduct.internal_id,
}: {
	ctx: AutumnContext;
	prepared: PreparedPlanLicenseSync;
	parentInternalProductId?: string;
}) => {
	const { parentProduct, resolved, removed } = prepared;

	logLicenseAction({
		ctx,
		action: "link",
		details: {
			parent: parentProduct.id,
			links: resolved.length,
			removed: removed.length,
		},
	});

	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		for (const link of resolved) {
			await planLicenseRepo.upsert({
				db: txDb,
				parentInternalProductId,
				licenseInternalProductId: link.licenseProduct.internal_id,
				included: link.included,
				prepaidOnly: link.prepaidOnly,
				metadata: link.entry.metadata,
			});
		}
		if (removed.length > 0) {
			await planLicenseRepo.deleteByIds({
				db: txDb,
				ids: removed.map((link) => link.id),
			});
		}
	});
};

export const syncPlanLicenses = async (args: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	licenses?: PlanLicenseParams[];
}) => {
	const prepared = await preparePlanLicenseSync(args);
	if (prepared) await applyPreparedPlanLicenseSync({ ctx: args.ctx, prepared });
};
