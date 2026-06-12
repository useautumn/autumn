import { InvoiceModeParamsSchema } from "@api/billing/common/invoiceModeParams";
import { RedirectModeSchema } from "@api/billing/common/redirectMode";
import {
	AttachParamsV1Schema,
	CreateScheduleParamsV0Schema,
	CreateSchedulePhaseSchema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import * as z from "zod/v4";
import { createDomainTools } from "./utils/builders.js";
import { epochMillisecondsSchema } from "./utils/dates.js";
import type { ToolDomain } from "./utils/types.js";

const createSchedulePhaseMcpSchema = CreateSchedulePhaseSchema.extend({
	starts_at: epochMillisecondsSchema.meta({
		description:
			"Phase start time as epoch milliseconds or an ISO date string. Date-only values use midnight UTC.",
	}),
});

const invoiceModeMcpSchema = InvoiceModeParamsSchema.extend({
	finalize: z.boolean().default(true).meta({
		description:
			"Follow the Billing resource for invoice finalization defaults.",
	}),
});

const createScheduleMcpSchema = CreateScheduleParamsV0Schema.extend({
	invoice_mode: invoiceModeMcpSchema.optional().meta({
		description:
			"Invoice mode for billing schedules. Follow the Billing resource.",
	}),
	phases: z
		.tuple([createSchedulePhaseMcpSchema])
		.rest(createSchedulePhaseMcpSchema),
	redirect_mode: RedirectModeSchema.default("if_required").meta({
		description: "Follow the Billing resource for checkout redirect defaults.",
	}),
}).superRefine((data, ctx) => {
	if (data.invoice_mode?.enabled !== true) return;
	if (data.invoice_mode.finalize !== false) {
		ctx.addIssue({
			code: "custom",
			message:
				"Paid schedule previews must use invoice_mode.finalize false unless a supported override path is added.",
			path: ["invoice_mode", "finalize"],
		});
	}
	if (data.redirect_mode !== "if_required") {
		ctx.addIssue({
			code: "custom",
			message:
				"Paid schedule previews must use redirect_mode if_required unless a supported override path is added.",
			path: ["redirect_mode"],
		});
	}
	if (data.enable_plan_immediately !== true) {
		ctx.addIssue({
			code: "custom",
			message:
				"Paid schedule previews must set top-level enable_plan_immediately true.",
			path: ["enable_plan_immediately"],
		});
	}
});

const endpoints = {
	previewAttach: "/v1/billing.preview_attach",
	attach: "/v1/billing.attach",
	previewUpdateSubscription: "/v1/billing.preview_update",
	updateSubscription: "/v1/billing.update",
	previewCreateSchedule: "/v1/billing.preview_create_schedule",
	createSchedule: "/v1/billing.create_schedule",
} as const;

const schemas = {
	previewAttach: AttachParamsV1Schema,
	attach: AttachParamsV1Schema,
	previewUpdateSubscription: UpdateSubscriptionV1ParamsSchema,
	updateSubscription: UpdateSubscriptionV1ParamsSchema,
	previewCreateSchedule: createScheduleMcpSchema,
	createSchedule: createScheduleMcpSchema,
} as const;

const { billingPreview, confirmedWrite } = createDomainTools({
	endpoints,
	schemas,
});

const domain = {
	billingPreviews: [
		billingPreview({
			id: "previewAttach",
			description: `
- Preview attaching a plan before attach.
- Follow the Billing resource.
`.trim(),
			writeToolName: "attach",
		}),
		billingPreview({
			id: "previewUpdateSubscription",
			description: `
- Preview updating a subscription before updateSubscription.
- Follow the Billing resource.
`.trim(),
			writeToolName: "updateSubscription",
		}),
		billingPreview({
			id: "previewCreateSchedule",
			description: `
- Preview billing impact of a multi-phase schedule or multi-year order form before createSchedule.
- Follow the Billing resource.
`.trim(),
			writeToolName: "createSchedule",
		}),
	],
	confirmedWrites: [
		confirmedWrite({
			id: "attach",
			description: `
- Attach a plan to a customer.
- Follow the Billing resource.
`.trim(),
		}),
		confirmedWrite({
			id: "updateSubscription",
			description: `
- Update a subscription.
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
	],
} satisfies ToolDomain;

export const billing = { endpoints, schemas, domain };
