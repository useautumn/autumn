import type { Feature, FullPlanLicense } from "@autumn/shared";
import { buildPlanChangeCore } from "@/internal/catalogV2/actions/buildPlanChange/buildPlanChangeCore/buildPlanChangeCore";
import { fullProductToApiPlanV1Sync } from "@/internal/catalogV2/actions/buildPlanChange/fullProductToApiPlanV1Sync";

export const buildLicenseEffectivePlanChange = ({
	from,
	to,
	features,
}: {
	from: FullPlanLicense;
	to: FullPlanLicense;
	features?: Feature[];
}) =>
	buildPlanChangeCore({
		from: fullProductToApiPlanV1Sync({ product: from.product, features }),
		to: fullProductToApiPlanV1Sync({ product: to.product, features }),
	});
