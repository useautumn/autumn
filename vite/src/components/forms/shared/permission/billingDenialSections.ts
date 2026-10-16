import type { PermissionDenial } from "./permissionSchemas";

/** Where a sheet renders a violation, by its field's root; unmapped fields go to "summary". */
export type PermissionSections = Record<string, string>;

export const BILLING_DENIAL_SECTIONS: PermissionSections = {
	incoming: "plan",
	outgoing: "plan",
	entity: "plan",
	discounts: "options",
	plan_schedule: "options",
	proration_behavior: "options",
	billing_cycle_anchor: "options",
	starts_at: "options",
	invoice_mode: "options",
	checkout: "options",
	cancel_action: "options",
	refund: "options",
};

const fieldRoot = ({ field }: { field: string }) =>
	field.split(/[.[]/)[0] ?? field;

export const violationsInSection = ({
	denial,
	section,
	sections = BILLING_DENIAL_SECTIONS,
}: {
	denial: PermissionDenial;
	section: string;
	sections?: PermissionSections;
}) =>
	denial.violations.filter(
		({ field }) => (sections[fieldRoot({ field })] ?? "summary") === section,
	);
