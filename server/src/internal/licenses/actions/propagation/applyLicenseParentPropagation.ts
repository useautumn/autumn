import type { ApiPlanV1, FullProduct, PlanLicenseParams } from "@autumn/shared";
import { diffLicensePlanCustomize } from "@/internal/licenses/actions/customize/toApiPlanLicenseWithCustomize.js";
import type {
	PreparedLicenseParentPropagation,
	PreparedLicenseParentTarget,
} from "./prepareLicenseParentPropagation.js";

type ParentVersioningMode = "inherit" | "in_place";

const updateChildLicense = ({
	licenses,
	child,
	customize,
}: {
	licenses: PlanLicenseParams[];
	child: FullProduct;
	customize: PlanLicenseParams["customize"];
}) =>
	licenses.map((license) =>
		license.license_plan_id === child.id ? { ...license, customize } : license,
	);

const buildPreservedLicenses = ({
	target,
	newChild,
	newChildPlan,
}: {
	target: PreparedLicenseParentTarget;
	newChild: FullProduct;
	newChildPlan: ApiPlanV1;
}) =>
	updateChildLicense({
		licenses: target.licenses,
		child: newChild,
		customize:
			diffLicensePlanCustomize({
				basePlan: newChildPlan,
				effectivePlan: target.currentEffectivePlan,
			}) ?? null,
	});

const buildPropagatedLicenses = ({
	target,
	newChild,
}: {
	target: PreparedLicenseParentTarget;
	newChild: FullProduct;
}) =>
	target.licenses.map((license) =>
		license.license_plan_id === newChild.id
			? {
					...license,
					...(license.customize === undefined ? { customize: null } : {}),
				}
			: license,
	);

export const applyLicenseParentPropagation = async ({
	prepared,
	oldChild,
	newChild,
	newChildPlan,
	forceVersion,
	updateParent,
}: {
	prepared?: PreparedLicenseParentPropagation;
	oldChild: FullProduct;
	newChild: FullProduct;
	newChildPlan: ApiPlanV1;
	forceVersion?: boolean;
	updateParent: (args: {
		parent: FullProduct;
		licenses: PlanLicenseParams[];
		versioning: ParentVersioningMode;
	}) => Promise<void>;
}) => {
	if (!prepared) return;
	const childWasVersioned = oldChild.internal_id !== newChild.internal_id;

	if (childWasVersioned) {
		for (const target of prepared.allParents) {
			if (target.selected && !target.hasCustomers) continue;
			await updateParent({
				parent: target.parent,
				licenses: buildPreservedLicenses({ target, newChild, newChildPlan }),
				versioning: "in_place",
			});
		}
	}

	for (const target of prepared.selectedParents) {
		if (!childWasVersioned && !target.hasCustomers && !forceVersion) continue;
		await updateParent({
			parent: target.parent,
			licenses: buildPropagatedLicenses({ target, newChild }),
			versioning: target.isLatest ? "inherit" : "in_place",
		});
	}
};
