import {
	type DbPlanLicense,
	type Entitlement,
	ErrCode,
	type FullProduct,
	findDuplicate,
	type PlanLicenseParams,
	type Price,
	RecaseError,
} from "@autumn/shared";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { insertCustomItems } from "@/internal/customers/attach/attachUtils/insertCustomItems.js";
import {
	computeLicenseCustomize,
	derivePlanLicenseItemRefs,
} from "@/internal/licenses/actions/customize/computeLicenseCustomize.js";
import {
	getFullLicenseProduct,
	toApiPlanLicenses,
} from "../../licenseUtils.js";
import { customerLicenseRepo } from "../../repos/customerLicenseRepo.js";
import { licenseAssignmentRepo } from "../../repos/licenseAssignmentRepo.js";
import { licenseItemRepo } from "../../repos/licenseItemRepo.js";
import { planLicenseRepo } from "../../repos/planLicenseRepo.js";
import { logLicenseAction } from "../logs/logLicenseAction.js";
import { retireCatalogPlanLicenseIfReferenced } from "./retireCatalogPlanLicenseIfReferenced.js";
import { validateLicenseLink } from "./validateLicenseLink.js";

type LicenseItemCustomization =
	| {
			mode: "preserve";
			sourcePlanLicenseId?: string;
			sourceCustomized?: boolean;
	  }
	| { mode: "clear" }
	| {
			mode: "replace";
			customPrices: Price[];
			customEntitlements: Entitlement[];
			items: ReturnType<typeof derivePlanLicenseItemRefs>;
	  };

export type ResolvedPlanLicenseLink = {
	entry: PlanLicenseParams;
	licenseProduct: FullProduct;
	effectiveProduct: FullProduct;
	included: number;
	prepaidOnly: boolean;
	itemCustomization: LicenseItemCustomization;
	sourcePlanLicense?: DbPlanLicense;
};

export type PreparedPlanLicenseSync = {
	parentProduct: FullProduct;
	resolved: ResolvedPlanLicenseLink[];
	successors: DbPlanLicense[];
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
	return { licenses: current, changes, prepared };
};

/** Resolves and validates one link without writing it. */
const resolveLink = async ({
	ctx,
	parentProduct,
	entry,
	licenseProducts,
	sourceLinkByLicenseInternalId,
	sourceProductByLicenseInternalId,
}: {
	ctx: AutumnContext;
	parentProduct: FullProduct;
	entry: PlanLicenseParams;
	licenseProducts?: FullProduct[];
	sourceLinkByLicenseInternalId: Map<
		string,
		PreparedPlanLicenseSync["removed"][number]
	>;
	sourceProductByLicenseInternalId: Map<string, FullProduct>;
}): Promise<ResolvedPlanLicenseLink> => {
	const virtualCandidates = licenseProducts
		?.filter((product) => product.id === entry.license_plan_id)
		.sort((a, b) => b.version - a.version);
	const licenseProduct =
		virtualCandidates?.[0] ??
		(await getFullLicenseProduct({
			ctx,
			idOrInternalId: entry.license_plan_id,
		}));

	const sourceLink = sourceLinkByLicenseInternalId.get(
		licenseProduct.internal_id,
	);
	let effectiveProduct = licenseProduct;
	let itemCustomization: LicenseItemCustomization;
	if (entry.customize === undefined) {
		itemCustomization = {
			mode: "preserve",
			sourcePlanLicenseId: sourceLink?.id,
			sourceCustomized: sourceLink?.customized,
		};
		if (sourceLink?.customized) {
			effectiveProduct =
				sourceProductByLicenseInternalId.get(licenseProduct.internal_id) ??
				licenseProduct;
		}
	} else if (entry.customize === null) {
		itemCustomization = { mode: "clear" };
	} else {
		const computation = await computeLicenseCustomize({
			ctx,
			licenseProduct,
			customize: entry.customize,
		});
		effectiveProduct = computation.effectiveProduct;
		itemCustomization = {
			mode: "replace",
			customPrices: computation.customPrices,
			customEntitlements: computation.customEntitlements,
			items: derivePlanLicenseItemRefs(computation.effectiveProduct),
		};
	}

	validateLicenseLink({
		parentProduct,
		licenseProduct: effectiveProduct,
		prepaidOnly: entry.prepaid_only ?? true,
		licensePlanId: entry.license_plan_id,
	});

	return {
		entry,
		licenseProduct,
		effectiveProduct,
		included: entry.included ?? 0,
		prepaidOnly: entry.prepaid_only ?? true,
		itemCustomization,
		sourcePlanLicense: sourceLink,
	};
};

/** Nesting is not supported: a plan offered as a license under other plans
 * cannot offer licenses of its own. Clearing (`licenses: []`) stays allowed. */
const assertParentNotLicensed = ({
	parentProduct,
	licenses,
}: {
	parentProduct: FullProduct;
	licenses: PlanLicenseParams[];
}) => {
	const parentIds = [
		...new Set(
			(parentProduct.parent_plan_licenses ?? []).map((link) => link.product.id),
		),
	];
	if (licenses.length === 0 || parentIds.length === 0) return;
	throw new RecaseError({
		message: `Cannot add licenses to ${parentProduct.id}: it is offered as a license under ${parentIds.join(", ")}.`,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
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
	assertParentNotLicensed({ parentProduct, licenses });

	const sourceLinks =
		parentProduct.licenses
			?.filter(
				(link) => link.parent_internal_product_id === fromInternalProductId,
			)
			.map(({ product: _, base_product: __, ...link }) => link) ??
		(await planLicenseRepo.listCatalogByParentInternalProductIds({
			db: ctx.db,
			parentInternalProductIds: [fromInternalProductId],
		}));
	const sourceLinkByLicenseInternalId = new Map(
		sourceLinks.map((link) => [link.license_internal_product_id, link]),
	);
	const sourceProductByLicenseInternalId = new Map(
		(parentProduct.licenses ?? []).map((link) => [
			link.license_internal_product_id,
			link.product,
		]),
	);
	const resolved = await Promise.all(
		licenses.map((entry) =>
			resolveLink({
				ctx,
				parentProduct,
				entry,
				licenseProducts,
				sourceLinkByLicenseInternalId,
				sourceProductByLicenseInternalId,
			}),
		),
	);
	const keepInternalIds = new Set(
		resolved.map((link) => link.licenseProduct.internal_id),
	);

	// Removals + capacity reductions must clear the active-assignment guard.
	const existingLinks = newParentVersion ? [] : sourceLinks;
	const resolvedPublicIds = new Set(
		resolved.map((link) => link.licenseProduct.id),
	);
	const successors: DbPlanLicense[] = [];
	const removed: DbPlanLicense[] = [];
	for (const link of existingLinks) {
		if (keepInternalIds.has(link.license_internal_product_id)) continue;
		const sourceProduct = sourceProductByLicenseInternalId.get(
			link.license_internal_product_id,
		);
		if (sourceProduct && resolvedPublicIds.has(sourceProduct.id)) {
			successors.push(link);
		} else {
			removed.push(link);
		}
	}
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

	return { parentProduct, resolved, successors, removed };
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
	const { parentProduct, resolved, successors, removed } = prepared;

	logLicenseAction({
		ctx,
		action: "link",
		details: {
			parent: parentProduct.id,
			links: resolved.length,
			successors: successors.length,
			removed: removed.length,
		},
	});

	await ctx.db.transaction(async (tx) => {
		const txDb = tx as unknown as DrizzleCli;
		const sourcePlanLicenses = resolved.flatMap(({ sourcePlanLicense }) =>
			sourcePlanLicense?.parent_internal_product_id === parentInternalProductId
				? [sourcePlanLicense]
				: [],
		);
		const referenceCandidates = [...sourcePlanLicenses, ...successors];
		const referencedPlanLicenseIds =
			await customerLicenseRepo.listReferencedPlanLicenseIds({
				db: txDb,
				planLicenseIds: referenceCandidates.map(({ id }) => id),
			});
		const sourceLinkByLicenseInternalId = new Map(
			sourcePlanLicenses.map((link) => [
				link.license_internal_product_id,
				link,
			]),
		);
		for (const link of resolved) {
			const current = sourceLinkByLicenseInternalId.get(
				link.licenseProduct.internal_id,
			);
			if (current) {
				await retireCatalogPlanLicenseIfReferenced({
					db: txDb,
					current,
					entry: link.entry,
					included: link.included,
					prepaidOnly: link.prepaidOnly,
					itemCustomizationMode: link.itemCustomization.mode,
					hasCustomerReference: referencedPlanLicenseIds.has(current.id),
				});
			}
			const planLicense = await planLicenseRepo.upsert({
				db: txDb,
				parentInternalProductId,
				licenseInternalProductId: link.licenseProduct.internal_id,
				included: link.included,
				prepaidOnly: link.prepaidOnly,
				metadata: link.entry.metadata,
			});
			const customization = link.itemCustomization;
			if (customization.mode === "replace") {
				await insertCustomItems({
					db: txDb,
					customPrices: customization.customPrices,
					customEnts: customization.customEntitlements,
				});
				await licenseItemRepo.replaceItems({
					db: txDb,
					planLicenseId: planLicense.id,
					items: customization.items,
					customized: true,
				});
			} else if (customization.mode === "clear") {
				await licenseItemRepo.replaceItems({
					db: txDb,
					planLicenseId: planLicense.id,
					items: [],
				});
			} else if (
				customization.sourcePlanLicenseId &&
				customization.sourcePlanLicenseId !== planLicense.id
			) {
				await licenseItemRepo.cloneItems({
					db: txDb,
					fromPlanLicenseId: customization.sourcePlanLicenseId,
					toPlanLicenseId: planLicense.id,
					customized: customization.sourceCustomized,
				});
			}
		}
		const replacedWithoutCustomers: DbPlanLicense[] = [];
		for (const link of successors) {
			if (referencedPlanLicenseIds.has(link.id)) {
				await planLicenseRepo.retireCatalogById({ db: txDb, id: link.id });
			} else {
				replacedWithoutCustomers.push(link);
			}
		}
		const deleted = [...replacedWithoutCustomers, ...removed];
		if (deleted.length > 0) {
			for (const link of deleted) {
				if (!link.customized) continue;
				await licenseItemRepo.replaceItems({
					db: txDb,
					planLicenseId: link.id,
					items: [],
				});
			}
			await planLicenseRepo.deleteByIds({
				db: txDb,
				ids: deleted.map((link) => link.id),
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
