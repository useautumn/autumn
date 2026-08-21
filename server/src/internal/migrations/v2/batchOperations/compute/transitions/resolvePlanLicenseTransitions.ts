import {
	type Feature,
	type FullPlanLicense,
	type FullProduct,
	isOneOffProduct,
} from "@autumn/shared";
import type { UpdatePlanOp } from "@autumn/shared/api/migrations/operations/customer/updatePlan/index.js";
import {
	type BasePriceTransition,
	computeBasePriceTransition,
} from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeBasePriceTransition.js";
import {
	type ComputedEntitlementPriceTransitions,
	computeEntitlementPriceTransitions,
} from "@/internal/billing/v2/actions/batchTransition/compute/transitions/computeEntitlementPriceTransitions.js";
import type { PreparedPlanLicenseRef } from "@/internal/migrations/v2/prepare/modules/ensurePlanLicenses/types.js";
import type { MigrationRuntime } from "@/internal/migrations/v2/types/migrationDefinition.js";
import { hashJson } from "@/utils/hash/hashJson.js";
import type { BatchMigrationRejection } from "../../types/index.js";
import { resolveLicenseCustomizeTransitions } from "./resolveLicenseCustomizeTransitions.js";

/** One link's diff, plus the identity and prepared traits the
 * entitlement-level transitions cannot carry on their own. */
export type LicenseLinkTransitions = {
	licensePlanId: string;
	planLicenseId: string;
	licenseInternalProductId: string;
	isOneOff: boolean;
	artifacts: PreparedPlanLicenseRef[];
	transitions: ComputedEntitlementPriceTransitions;
	/** The seat price the pool bills on, which no entitlement transition carries. */
	basePrice?: BasePriceTransition;
};

const linkFieldsMatch = ({
	from,
	to,
}: {
	from: FullPlanLicense;
	to: FullPlanLicense;
}) =>
	from.included === to.included &&
	from.prepaid_only === to.prepaid_only &&
	hashJson({ value: from.metadata }) === hashJson({ value: to.metadata });

const licenseLinkRejection = ({
	opIndex,
	planId,
	licensePlanId,
	message,
}: {
	opIndex: number;
	planId: string;
	licensePlanId: string;
	message: string;
}): BatchMigrationRejection => ({
	code: "license_link_transition",
	opIndex,
	planId,
	message,
	details: { licensePlanId },
});

/** The single owner of every license transition a patch carries: pairs the
 * from-product's links with the target's, customize-minted links overriding
 * their catalog counterpart, and rejects anything the pool repoint cannot
 * express to the per-customer lane. */
export const resolvePlanLicenseTransitions = ({
	migration,
	op,
	opIndex,
	fromProduct,
	toProduct,
	features,
}: {
	migration: MigrationRuntime;
	op: UpdatePlanOp;
	opIndex: number;
	fromProduct: FullProduct;
	toProduct: FullProduct;
	features: Feature[];
}): {
	links: LicenseLinkTransitions[];
	rejections: BatchMigrationRejection[];
} => {
	const { links: customizeLinks, rejections: customizeRejections } =
		resolveLicenseCustomizeTransitions({
			migration,
			op,
			opIndex,
			targetProduct: toProduct,
			features,
		});
	if (customizeRejections.length > 0) {
		return { links: [], rejections: customizeRejections };
	}

	const fromLinks = new Map<string, FullPlanLicense>();
	for (const link of fromProduct.licenses ?? []) {
		fromLinks.set(link.product.id, link);
	}
	const toLinks = new Map<string, FullPlanLicense>();
	for (const link of toProduct.licenses ?? []) {
		toLinks.set(link.product.id, link);
	}
	const customizeLinkByPlanId = new Map(
		customizeLinks.map((link) => [link.licensePlanId, link]),
	);

	const links: LicenseLinkTransitions[] = [];
	const rejections: BatchMigrationRejection[] = [];
	const licensePlanIds = new Set([...fromLinks.keys(), ...toLinks.keys()]);
	for (const licensePlanId of licensePlanIds) {
		const from = fromLinks.get(licensePlanId);
		const to = toLinks.get(licensePlanId);
		const reject = (message: string) =>
			rejections.push(
				licenseLinkRejection({
					opIndex,
					planId: fromProduct.id,
					licensePlanId,
					message,
				}),
			);

		if (!from || !to) {
			reject(
				"Added or removed license links require per-customer billing work.",
			);
			continue;
		}
		// The batch lane only repoints pool definition rows; swapping the license
		// product itself (seats, dedupe pointers) is per-customer work.
		if (from.license_internal_product_id !== to.license_internal_product_id) {
			reject(
				"The target version links a different license product version; runs per-customer.",
			);
			continue;
		}
		if (!linkFieldsMatch({ from, to })) {
			reject(
				"Structurally changed license links require per-customer billing work.",
			);
			continue;
		}

		const basePrice = computeBasePriceTransition({
			fromProduct: from.product,
			toProduct: to.product,
		});

		const customizeLink = customizeLinkByPlanId.get(licensePlanId);
		if (customizeLink) {
			links.push({ ...customizeLink, basePrice });
			continue;
		}

		// Same catalog row means nothing to repoint; a version bump mints a new
		// plan_license row per link, so the pool must follow it.
		if (to.id === from.id) continue;
		links.push({
			licensePlanId,
			planLicenseId: to.id,
			licenseInternalProductId: to.license_internal_product_id,
			isOneOff: isOneOffProduct(to.base_product ?? to.product),
			artifacts: [],
			basePrice,
			transitions: computeEntitlementPriceTransitions({
				fromProduct: from.product,
				toProduct: to.product,
			}),
		});
	}

	if (rejections.length > 0) return { links: [], rejections };
	return { links, rejections: [] };
};
