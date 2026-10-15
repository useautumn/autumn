import type { ApprovalAction } from "@autumn/shared";
import type { AxiosInstance } from "axios";
import { z } from "zod/v4";

// Local copies of approvals-api-schema §3 and §R until F1 (preview), E2 (403) and E3 (can) export them.
const ViolationValueSchema = z.union([z.string(), z.boolean()]);

const PermissionDenialSchema = z.object({
	violations: z.array(
		z.object({
			field: z.string(),
			label: z.string(),
			limit: ViolationValueSchema,
			actual: ViolationValueSchema,
		}),
	),
	decided_by: z.object({
		level: z.enum(["user", "role", "everyone"]),
		rule_id: z.string(),
		rule_name: z.string(),
	}),
	allowed_roles: z.array(z.string()),
	message: z.string(),
});

const PreviewPermissionSchema = z.discriminatedUnion("verdict", [
	z.object({ verdict: z.literal("allow") }),
	PermissionDenialSchema.extend({ verdict: z.literal("deny") }),
]);

const PermissionDeniedErrorSchema = z.object({
	response: z.object({
		status: z.literal(403),
		data: PermissionDenialSchema.extend({
			code: z.literal("permission_denied"),
		}),
	}),
});

export type PermissionDenial = z.infer<typeof PermissionDenialSchema>;
export type PermissionViolation = PermissionDenial["violations"][number];
export type CanDoResponse = {
	can: boolean;
	reason: "rule" | "scope" | "exempt" | "none";
};

/** Where a violation renders: next to the plans, next to the billing options, or in the footer summary. */
export type PermissionSection = "plan" | "options" | "summary";

const SECTION_BY_FIELD: Record<string, PermissionSection> = {
	incoming: "plan",
	outgoing: "plan",
	discounts: "options",
	plan_schedule: "options",
	proration_behavior: "options",
	starts_at: "options",
	invoice_mode: "options",
	checkout: "options",
	cancel_action: "options",
	refund: "options",
};

const LEVEL_LABELS: Record<PermissionDenial["decided_by"]["level"], string> = {
	user: "Member rule",
	role: "Role rule",
	everyone: "Everyone rule",
};

export const fetchCanDo = async ({
	axios,
	action,
}: {
	axios: AxiosInstance;
	action: ApprovalAction;
}) =>
	(await axios.get<CanDoResponse>("/approvals/can", { params: { action } }))
		.data;

/** An unanswered check allows, so a missing or failing endpoint never hides a button. */
export const canDoAllows = ({
	response,
}: {
	response: CanDoResponse | undefined;
}) =>
	!response ||
	response.can ||
	response.reason === "exempt" ||
	response.reason === "none";

const denialFromPreview = ({ preview }: { preview: unknown }) => {
	const parsed = z
		.object({ permission: PreviewPermissionSchema })
		.safeParse(preview);
	if (!parsed.success || parsed.data.permission.verdict === "allow") {
		return null;
	}
	return parsed.data.permission;
};

const denialFromError = ({ error }: { error: unknown }) => {
	const parsed = PermissionDeniedErrorSchema.safeParse(error);
	return parsed.success ? parsed.data.response.data : null;
};

/**
 * The preview's deny locks submit. A 403 from submit shows the same way but
 * leaves the button enabled so an edited request can be retried.
 */
export const resolvePermissionDenial = ({
	preview,
	error,
}: {
	preview: unknown;
	error: unknown;
}) => {
	const previewDenial = denialFromPreview({ preview });
	if (previewDenial) return { denial: previewDenial, locksSubmit: true };

	const submitDenial = denialFromError({ error });
	if (submitDenial) return { denial: submitDenial, locksSubmit: false };

	return null;
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
			(SECTION_BY_FIELD[fieldRoot({ field })] ?? "summary") === section,
	);

const formatValue = (value: string | boolean) => {
	if (typeof value === "string") return value;
	return value ? "yes" : "no";
};

export const formatViolation = ({
	violation,
}: {
	violation: PermissionViolation;
}) =>
	`${violation.label}: limit ${formatValue(violation.limit)}, you entered ${formatValue(violation.actual)}`;

export const formatDecidedBy = ({ denial }: { denial: PermissionDenial }) =>
	`${LEVEL_LABELS[denial.decided_by.level]} · ${denial.decided_by.rule_name}`;

/** "Ask an owner, admin or finance": owner and admin lead, as the contract always lists them. */
export const formatAskRoles = ({ denial }: { denial: PermissionDenial }) => {
	const leading = ["owner", "admin"];
	const others = denial.allowed_roles.filter((role) => !leading.includes(role));
	const roles = [...leading, ...others].map((role) =>
		role.replace(/[_-]/g, " "),
	);
	const last = roles.pop();
	return `Ask an ${roles.join(", ")} or ${last}`;
};
