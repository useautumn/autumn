import type {
	ApiPlanV1,
	FullProduct,
	PlanLicenseParams,
	UpdateLicenseParentParams,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { customerProductRepo } from "@/internal/customers/cusProducts/repos/index.js";
import { buildApiPlanLicense } from "@/internal/products/productUtils/productResponseUtils/buildApiPlanLicense.js";
import { getPlanResponse } from "@/internal/products/productUtils/productResponseUtils/getPlanResponse.js";
import {
	type LicenseParentContext,
	listLicenseParentContexts,
} from "./listLicenseParentContexts.js";
import {
	licenseParentTargetKey,
	resolveLicenseParentTargets,
} from "./resolveLicenseParentTargets.js";

export type PreparedLicenseParentTarget = LicenseParentContext & {
	licenses: PlanLicenseParams[];
	currentEffectivePlan: ApiPlanV1;
	hasCustomers: boolean;
	isLatest: boolean;
	selected: boolean;
};

export type PreparedLicenseParentPropagation = {
	allParents: PreparedLicenseParentTarget[];
	selectedParents: PreparedLicenseParentTarget[];
};

export const prepareLicenseParentPropagation = async ({
	ctx,
	child,
	targets = [],
}: {
	ctx: AutumnContext;
	child: FullProduct;
	targets?: UpdateLicenseParentParams[];
}): Promise<PreparedLicenseParentPropagation> => {
	const contexts = await listLicenseParentContexts({ ctx, child });
	const selectedContexts = resolveLicenseParentTargets({
		contexts,
		targets,
		childPlanId: child.id,
	});
	if (contexts.length === 0) return { allParents: [], selectedParents: [] };

	const usageByInternalId = await customerProductRepo.getVersioningUsage({
		db: ctx.db,
		internalProductIds: contexts.map(({ parent }) => parent.internal_id),
	});
	const latestVersionByPlanId = new Map<string, number>();
	for (const { parent } of contexts) {
		latestVersionByPlanId.set(
			parent.id,
			Math.max(latestVersionByPlanId.get(parent.id) ?? 0, parent.version),
		);
	}
	const selectedKeys = new Set(
		selectedContexts.map(({ parent }) =>
			licenseParentTargetKey({
				planId: parent.id,
				version: parent.version,
			}),
		),
	);
	const toPlanLicenseParams = async (
		license: NonNullable<FullProduct["licenses"]>[number],
	): Promise<PlanLicenseParams> => {
		const { version: _, ...params } = await buildApiPlanLicense({
			ctx,
			license,
			features: ctx.features,
		});
		return params;
	};

	const allParents = await Promise.all(
		contexts.map(async (context): Promise<PreparedLicenseParentTarget> => {
			const [licenses, currentEffectivePlan] = await Promise.all([
				Promise.all((context.parent.licenses ?? []).map(toPlanLicenseParams)),
				getPlanResponse({
					ctx,
					product: context.link.product,
					features: ctx.features,
				}),
			]);
			const usage = usageByInternalId.get(context.parent.internal_id);
			return {
				...context,
				licenses,
				currentEffectivePlan,
				hasCustomers: usage?.hasVersionableCustomerProducts ?? false,
				isLatest:
					context.parent.version ===
					latestVersionByPlanId.get(context.parent.id),
				selected: selectedKeys.has(
					licenseParentTargetKey({
						planId: context.parent.id,
						version: context.parent.version,
					}),
				),
			};
		}),
	);

	return {
		allParents,
		selectedParents: allParents.filter(({ selected }) => selected),
	};
};
