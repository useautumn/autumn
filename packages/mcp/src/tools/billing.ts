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

const createScheduleMcpSchema = CreateScheduleParamsV0Schema.extend({
	phases: z
		.tuple([createSchedulePhaseMcpSchema])
		.rest(createSchedulePhaseMcpSchema),
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
- Include feature_quantities and custom items/prices.
- Map recurring custom grants like 'per month/year' to reset.interval.
- Default paid attach billing: set enable_plan_immediately true and invoice_mode enabled true, enable_plan_immediately true, finalize false.
- Only change the default invoice mode if the user asks for checkout, immediate finalization/payment, no invoice, or delayed access.
- invoice_mode requires customer email; if missing, call updateCustomer first.
`.trim(),
			writeToolName: "attach",
		}),
		billingPreview({
			id: "previewUpdateSubscription",
			description: `
- Preview updating a subscription before updateSubscription.
- Include quantity and custom item changes.
- Recurring custom grants need reset.interval.
`.trim(),
			writeToolName: "updateSubscription",
		}),
		billingPreview({
			id: "previewCreateSchedule",
			description: `
- Preview billing impact of a multi-phase schedule before createSchedule.
- First phase starts_at must be explicit: now or a past/backdated date.
- Do not infer first starts_at from 'year 1' or use a future first phase.
- Ask before previewing if first phase start is unclear.
- Preserve exact user/contract dates for later phases.
- Use redirect_mode if_required unless user asks otherwise.
- Default paid schedule billing: set enable_plan_immediately true and invoice_mode enabled true, enable_plan_immediately true, finalize false.
- Only change the default invoice mode if the user asks for checkout, immediate finalization/payment, no invoice, or delayed access.
- invoice_mode requires customer email; if missing, call updateCustomer first.
- Inspect customer first when changing an existing/customer contract schedule.
- Put schedule feature overrides in plan.customize.items, not feature_quantities.
- Map recurring grants like 'per month/year' to reset.interval month/year.
- If year 1 is already paid/no billing changes, omit it.
`.trim(),
			writeToolName: "createSchedule",
		}),
	],
	confirmedWrites: [
		confirmedWrite({
			id: "attach",
			description: `
- Attach a plan to a customer.
- Destructive: preview first.
- Preserve feature_quantities, custom prices/items, reset intervals, discounts, and checkout behavior.
- Preserve the previewed billing mode. Default paid attach billing uses enable_plan_immediately true and invoice_mode enabled true, enable_plan_immediately true, finalize false.
- invoice_mode requires customer email; if missing, call updateCustomer first.
`.trim(),
		}),
		confirmedWrite({
			id: "updateSubscription",
			description: `
- Update a subscription.
- Destructive: preview first.
- Preserve quantity/custom item changes and reset intervals from the previewed request.
`.trim(),
		}),
		confirmedWrite({
			id: "createSchedule",
			description: `
- Create a multi-phase billing schedule.
- Destructive: preview first.
- Preserve phase starts_at and redirect_mode values from the previewed request.
- First phase starts_at must be explicit: now or a past/backdated date.
- Do not infer first starts_at from 'year 1' or use a future first phase.
- Ask before creating if first phase start is unclear.
- Use redirect_mode if_required unless user asks otherwise.
- Preserve the previewed billing mode. Default paid schedule billing uses enable_plan_immediately true and invoice_mode enabled true, enable_plan_immediately true, finalize false.
- invoice_mode requires customer email; if missing, call updateCustomer first.
- Inspect customer first when changing an existing/customer contract schedule.
- Put schedule feature overrides in plan.customize.items, not feature_quantities.
- If year 1 is already paid/no billing changes, omit it.
`.trim(),
		}),
	],
} satisfies ToolDomain;

export const billing = { endpoints, schemas, domain };
