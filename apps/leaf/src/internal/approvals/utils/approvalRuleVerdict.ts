import type { PreviewPermission } from "@autumn/shared";

type DeniedPermission = Extract<PreviewPermission, { verdict: "deny" }>;

const readPermission = ({
	preview,
}: {
	preview: unknown;
}): PreviewPermission | undefined => {
	if (!preview || typeof preview !== "object") return undefined;
	return (preview as { permission?: PreviewPermission }).permission;
};

const formatValue = (value: string | boolean) => {
	if (value === true) return "Yes";
	if (value === false) return "No";
	return value;
};

const formatRole = (role: string) =>
	role.charAt(0).toUpperCase() + role.slice(1);

/** The designs' denial: the rule's note, each limit vs this request, and who can approve instead. */
const denialText = ({ permission }: { permission: DeniedPermission }) =>
	[
		`You can't approve this. ${permission.message}`,
		...permission.violations.map(
			({ label, limit, actual }) =>
				`• ${label}: limit ${formatValue(limit)}, this request ${formatValue(actual)}`,
		),
		`Who can approve it: ${permission.allowed_roles.map(formatRole).join(", ")}.`,
	].join("\n");

/** The denial text for a preview the approval rules deny for this clicker. */
export const previewRuleDenial = ({
	preview,
}: {
	preview: unknown;
}): string | undefined => {
	const permission = readPermission({ preview });
	if (permission?.verdict !== "deny") return undefined;
	return denialText({ permission });
};

/** A grouped card runs only if every step passes, so the first denied step decides. */
export const firstRuleDenial = ({
	previews,
}: {
	previews: ReadonlyArray<unknown>;
}): string | undefined =>
	previews
		.map((preview) => previewRuleDenial({ preview }))
		.find((denial) => denial !== undefined);
