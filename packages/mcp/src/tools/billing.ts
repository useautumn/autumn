import {
	AttachParamsV1Schema,
	CreateScheduleParamsV0Schema,
	UpdateSubscriptionV1ParamsSchema,
} from "@autumn/shared/publicApiSchemas";
import { createDomainTools } from "./utils/builders.js";
import type { ToolDomain } from "./utils/types.js";

const createScheduleMcpSchema = CreateScheduleParamsV0Schema.check((ctx) => {
	const data = ctx.value;
	if (data.invoice_mode?.enabled !== true) return;
	if (data.invoice_mode.finalize !== false) {
		ctx.issues.push({
			code: "custom",
			message:
				"Paid schedule previews must use invoice_mode.finalize false unless a supported override path is added.",
			path: ["invoice_mode", "finalize"],
			input: data,
		});
	}
	if (data.redirect_mode !== "if_required") {
		ctx.issues.push({
			code: "custom",
			message:
				"Paid schedule previews must use redirect_mode if_required unless a supported override path is added.",
			path: ["redirect_mode"],
			input: data,
		});
	}
	if (data.enable_plan_immediately !== true) {
		ctx.issues.push({
			code: "custom",
			message:
				"Paid schedule previews must set top-level enable_plan_immediately true.",
			path: ["enable_plan_immediately"],
			input: data,
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

const planItemExpand = [
	"incoming.plan.items.feature",
	"outgoing.plan.items.feature",
];

const domain = {
	billingPreviews: [
		billingPreview({
			id: "previewAttach",
			description: `
- Preview attaching a plan before attach.
- Follow the Billing resource.
`.trim(),
			expand: planItemExpand,
			writeToolName: "attach",
		}),
		billingPreview({
			id: "previewUpdateSubscription",
			description: `
- Preview updating a subscription before updateSubscription.
- Follow the Billing resource.
`.trim(),
			expand: planItemExpand,
			writeToolName: "updateSubscription",
		}),
		billingPreview({
			id: "previewCreateSchedule",
			description: `
- Preview billing impact of a multi-phase schedule or multi-year order form before createSchedule.
- Follow the Billing resource.
`.trim(),
			expand: planItemExpand,
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
