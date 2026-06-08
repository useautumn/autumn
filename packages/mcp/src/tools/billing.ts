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
			description:
				"Preview attaching a plan before attach. Include feature_quantities and custom items/prices; map recurring custom grants like 'per month/year' to reset.interval. When using invoice_mode, usually set enable_plan_immediately true unless the user explicitly wants access to wait for payment. invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing.",
			writeToolName: "attach",
		}),
		billingPreview({
			id: "previewUpdateSubscription",
			description:
				"Preview updating a subscription before updateSubscription. Include quantity/custom item changes; recurring custom grants need reset.interval.",
			writeToolName: "updateSubscription",
		}),
		billingPreview({
			id: "previewCreateSchedule",
			description:
				"Preview billing impact of a multi-phase schedule before createSchedule. starts_at accepts epoch milliseconds or ISO/date strings; preserve exact calendar dates from the user or contract. Use redirect_mode if_required unless the user explicitly asks to disable checkout/redirects. If using invoice_mode, usually set enable_plan_immediately true unless the user explicitly wants access to wait for payment. invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing. If changing an existing/customer contract schedule, inspect the customer first. For schedules, put phase-specific feature quantities and contract feature limits/overrides in plan.customize.items, not feature_quantities; map 'per month/year' to reset.interval month/year. If the user says year 1 is already paid or should have no billing changes, do not add a year-1 phase; start phases at the first future billing change.",
			writeToolName: "createSchedule",
		}),
	],
	confirmedWrites: [
		confirmedWrite({
			id: "attach",
			description:
				"Attach a plan to a customer. Destructive: preview first; preserve feature_quantities, custom prices/items, reset intervals, discounts, and checkout behavior. When using invoice_mode, usually set enable_plan_immediately true unless the user explicitly wants access to wait for payment. invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing.",
		}),
		confirmedWrite({
			id: "updateSubscription",
			description:
				"Update a subscription. Destructive: preview first; preserve quantity/custom item changes and reset intervals from the previewed request.",
		}),
		confirmedWrite({
			id: "createSchedule",
			description:
				"Create a multi-phase billing schedule. Destructive: preview first; preserve phase starts_at and redirect_mode values from the previewed request. Use redirect_mode if_required unless the user explicitly asks to disable checkout/redirects. When using invoice_mode, usually set enable_plan_immediately true unless the user explicitly wants access to wait for payment. invoice_mode requires customer email; if missing, ask for it and call updateCustomer with customer_id and email before billing. If changing an existing/customer contract schedule, inspect the customer first. For schedules, put phase-specific feature quantities and contract feature limits/overrides in plan.customize.items, not feature_quantities. If year 1 is already paid/no billing changes, do not add a year-1 phase; start at the first future billing change.",
		}),
	],
} satisfies ToolDomain;

export const billing = { endpoints, schemas, domain };
