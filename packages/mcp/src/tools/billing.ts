import {
	AttachParamsV1Schema,
	CreateScheduleParamsV0Schema,
	createScheduleTimingIssues,
	SetPlansParamsV0Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

type ScheduleRequest = {
	enable_plan_immediately?: boolean;
	invoice_mode?: { enabled?: boolean; finalize?: boolean };
	redirect_mode?: string;
};

const paidScheduleInvoiceModeIssues = (data: ScheduleRequest) => {
	if (data.invoice_mode?.enabled !== true) return [];

	const issues: { message: string; path: string[] }[] = [];
	if (data.invoice_mode.finalize !== false) {
		issues.push({
			message:
				"Paid schedule previews must use invoice_mode.finalize false unless a supported override path is added.",
			path: ["invoice_mode", "finalize"],
		});
	}
	if (data.redirect_mode !== "if_required") {
		issues.push({
			message:
				"Paid schedule previews must use redirect_mode if_required unless a supported override path is added.",
			path: ["redirect_mode"],
		});
	}
	if (data.enable_plan_immediately !== true) {
		issues.push({
			message:
				"Paid schedule previews must set top-level enable_plan_immediately true.",
			path: ["enable_plan_immediately"],
		});
	}
	return issues;
};

const createScheduleMcpSchema = CreateScheduleParamsV0Schema.check((ctx) => {
	for (const issue of paidScheduleInvoiceModeIssues(ctx.value)) {
		ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
	}
});

// `undeclared_plans` is internal on the public API but exposed here, so an
// agent can keep plans it does not list, as createSchedule does. `extend`
// drops the parent's object-level checks, so the timing checks are re-applied.
// Typed loosely: its inferred type is too large for the domain exports to serialize.
const setPlansMcpSchema: z.ZodType = SetPlansParamsV0Schema.extend({
	undeclared_plans: z.enum(["end", "retain"]).optional().meta({
		description:
			"What happens to a current plan in the request's scope that no phase or unscheduled plan lists: 'end' (default) ends it now, 'retain' keeps it running until a listed plan claims its group.",
	}),
}).check((ctx) => {
	for (const issue of [
		...createScheduleTimingIssues(ctx.value.phases),
		...paidScheduleInvoiceModeIssues(ctx.value),
	]) {
		ctx.issues.push({ code: "custom", input: ctx.value, ...issue });
	}
});

const endpoints = {
	previewAttach: "/v1/billing.preview_attach",
	attach: "/v1/billing.attach",
	previewUpdateSubscription: "/v1/billing.preview_update",
	updateSubscription: "/v1/billing.update",
	previewCreateSchedule: "/v1/billing.preview_create_schedule",
	createSchedule: "/v1/billing.create_schedule",
	previewSetPlans: "/v1/billing.preview_set_plans",
	setPlans: "/v1/billing.set_plans",
} as const;

const schemas = {
	previewAttach: AttachParamsV1Schema,
	attach: AttachParamsV1Schema,
	previewUpdateSubscription: UpdateSubscriptionV1ParamsSchema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
	previewCreateSchedule: createScheduleMcpSchema,
	createSchedule: createScheduleMcpSchema,
	previewSetPlans: setPlansMcpSchema,
	setPlans: setPlansMcpSchema,
} as const;

const { billingPreview, confirmedWrite } = createDomainTools({
	endpoints,
	schemas,
});

const attachTargeting =
	"- Use when the request is about a plan or product line the customer is not on — attach from that group, customizing the closest plan when none matches the requested terms, even if the customer has other subscriptions.";
const updateSubscriptionTargeting =
	"- Only for changing terms of the plan the request is about; a request naming a different plan or product line is an attach, never an update to another subscription.";

const domain = {
	billingPreviews: [
		billingPreview({
			id: "previewAttach",
			description: `
- Preview attaching a plan before attach.
${attachTargeting}
- Follow the Billing resource.
`.trim(),
		}),
		billingPreview({
			id: "previewUpdateSubscription",
			description: `
- Preview updating a subscription before updateSubscription.
${updateSubscriptionTargeting}
- Follow the Billing resource.
`.trim(),
		}),
		billingPreview({
			id: "previewCreateSchedule",
			description: `
- Preview billing impact of a multi-phase schedule or multi-year order form before createSchedule.
- Follow the Billing resource.
`.trim(),
		}),
		billingPreview({
			id: "previewSetPlans",
			description: `
- Preview setting a customer's plans over dated phases before setPlans: the billing impact, each phase, and warnings about plans it ends.
- Follow the Billing resource.
`.trim(),
		}),
	],
	confirmedWrites: [
		confirmedWrite({
			id: "attach",
			description: `
- Attach a plan to a customer.
${attachTargeting}
- Follow the Billing resource.
`.trim(),
		}),
		confirmedWrite({
			id: "updateSubscription",
			description: `
- Update a subscription.
${updateSubscriptionTargeting}
- Follow the Billing resource.
`.trim(),
		}),
		confirmedWrite({
			id: "createSchedule",
			description: `
- Create a multi-phase billing schedule for phased or multi-year order forms.
- Follow the Billing resource.
`.trim(),
		}),
		confirmedWrite({
			id: "setPlans",
			description: `
- Set a customer's plans over dated phases (ramps, multi-year order forms, scheduled plan changes). Replaces the customer's existing schedule.
- Follow the Billing resource.
`.trim(),
		}),
	],
} satisfies ToolDomain;

export const billing = { endpoints, schemas, domain };
