import {
	ErrCode,
	RecaseError,
	type UpdateLicenseParentParams,
} from "@autumn/shared";
import type { LicenseParentContext } from "./listLicenseParentContexts.js";

export const licenseParentTargetKey = ({
	planId,
	version,
}: {
	planId: string;
	version: number;
}) => `${planId}@${version}`;

export const resolveLicenseParentTargets = ({
	contexts,
	targets,
	childPlanId,
}: {
	contexts: LicenseParentContext[];
	targets: UpdateLicenseParentParams[];
	childPlanId: string;
}): LicenseParentContext[] => {
	const contextByKey = new Map(
		contexts.map((context) => [
			licenseParentTargetKey({
				planId: context.parent.id,
				version: context.parent.version,
			}),
			context,
		]),
	);
	const selectedKeys = new Set<string>();
	const selectedContexts: LicenseParentContext[] = [];
	for (const target of targets) {
		const key = licenseParentTargetKey({
			planId: target.plan_id,
			version: target.version,
		});
		if (selectedKeys.has(key)) {
			throw new RecaseError({
				message: `Parent plan target ${key} was selected more than once.`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: 400,
			});
		}
		const context = contextByKey.get(key);
		if (!context) {
			throw new RecaseError({
				message: `Plan ${target.plan_id} v${target.version} does not offer ${childPlanId} as a license.`,
				code: ErrCode.InvalidPropagationTarget,
				statusCode: 400,
			});
		}
		selectedKeys.add(key);
		selectedContexts.push(context);
	}
	return selectedContexts;
};
