import type { PermissionDenial } from "./permissionSchemas";

/** Where a billing sheet renders a violation, by its field's root; unmapped fields go to "summary". */
export type PermissionSection = "plan" | "options" | "summary";

const BILLING_DENIAL_SECTIONS: Record<string, PermissionSection> = {
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
}: {
	denial: PermissionDenial;
	section: PermissionSection;
}) =>
	denial.violations.filter(
		({ field }) =>
			(BILLING_DENIAL_SECTIONS[fieldRoot({ field })] ?? "summary") === section,
	);
