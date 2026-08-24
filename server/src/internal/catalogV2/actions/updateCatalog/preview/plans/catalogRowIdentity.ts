export const defaultVersionSlug = ({ version }: { version: number }) =>
	`v${version}`;

type IdentityProduct = {
	id: string;
	version_slug?: string | null;
	active: boolean;
};

type PreviousActiveProduct = {
	version: number;
	version_slug?: string | null;
};

/** Object presence means this row is taking the active pointer. */
export const promotionDetailsForPlan = ({
	previousActive,
}: {
	previousActive?: PreviousActiveProduct | null;
}): { previous_active_version_slug: string } | undefined => {
	if (!previousActive) return undefined;
	return {
		previous_active_version_slug:
			previousActive.version_slug ??
			defaultVersionSlug({ version: previousActive.version }),
	};
};

/** Identity trio for a preview row — `new_*` only when that field actually changes. */
export const catalogRowIdentity = ({
	planId,
	version,
	current,
	next,
}: {
	planId: string;
	version: number;
	current?: IdentityProduct | null;
	next: IdentityProduct;
}): {
	plan_id: string;
	version: number;
	version_slug: string;
	active: boolean;
	new_plan_id?: string;
	new_version_slug?: string;
} => {
	const fallbackSlug = defaultVersionSlug({ version });
	const versionSlug = current?.version_slug ?? fallbackSlug;
	const nextSlug = next.version_slug ?? fallbackSlug;
	const currentPlanId = current?.id ?? planId;

	return {
		plan_id: planId,
		version,
		version_slug: versionSlug,
		active: next.active,
		...(next.id !== currentPlanId ? { new_plan_id: next.id } : {}),
		...(nextSlug !== versionSlug ? { new_version_slug: nextSlug } : {}),
	};
};
