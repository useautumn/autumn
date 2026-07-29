import {
	type ApiPlanV1,
	type CorePlanUpdatePreview,
	diffPlanV1PreviewFields,
	expandPathIncludes,
} from "@autumn/shared";

export const buildCorePlanUpdatePreview = ({
	ctx,
	planId,
	current,
	preview,
	hasCustomers,
	customerCount,
	versionable,
}: {
	ctx: { expand: string[] };
	planId: string;
	current: ApiPlanV1;
	preview: ApiPlanV1;
	hasCustomers: boolean;
	customerCount: number;
	versionable: boolean;
}): CorePlanUpdatePreview => {
	const shouldExpandPlanFromScopedCtx = expandPathIncludes({
		expand: ctx.expand,
		includes: ["plan"],
	});
	const diff = diffPlanV1PreviewFields({ from: current, to: preview });

	return {
		plan_id: planId,
		license_changes: [],
		...(shouldExpandPlanFromScopedCtx ? { plan: preview } : {}),
		has_customers: hasCustomers,
		customer_count: customerCount,
		versionable,
		...diff,
	};
};
