import {
	type CreateCustomerExportParams,
	CustomerExportKind,
	checkScopes,
	ErrCode,
	RecaseError,
	Scopes,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";

export const assertCanApplyCustomPlans = ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: CreateCustomerExportParams;
}) => {
	const isApplyRun =
		params.kind === CustomerExportKind.CustomPlans && params.apply;
	const isScoped = ctx.scopes.length > 0;
	if (!isApplyRun || !isScoped) return;

	const { allowed, missing } = checkScopes(
		[Scopes.Customers.Write],
		ctx.scopes,
	);
	if (allowed) return;
	throw new RecaseError({
		message: `Insufficient scopes. Missing: ${missing.join(", ")}`,
		code: ErrCode.InsufficientScopes,
		statusCode: 403,
	});
};
