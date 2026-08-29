import {
	customizeNeedsCurrentPlan,
	customizeWithFreeTrial,
	parsePreviewPayload,
} from "@autumn/render";
import type { AppEnv } from "@autumn/shared";
import { errorMessage } from "../../../lib/errorMessage.js";
import { logger } from "../../../lib/logger.js";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";
import { autumnMcpErrorText } from "../../autumnMcp/errorResult.js";

const text = (value: unknown) =>
	typeof value === "string" && value.trim() ? value.trim() : null;

const record = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const getArray = (value: unknown): unknown[] =>
	Array.isArray(value) ? value : [];

const planNameFromPreview = ({
	planId,
	preview,
}: {
	planId: string | null;
	preview: unknown;
}) => {
	if (!planId) return null;
	const payload = parsePreviewPayload(preview) ?? {};
	const changes = [payload.incoming, payload.outgoing, payload.plan_changes]
		.flatMap((value) => (Array.isArray(value) ? value : []))
		.map(record);
	const change = changes.find((value) => value.plan_id === planId);
	const name = text(record(change?.plan).name);
	if (name) return name;
	const lineItems = Array.isArray(payload.line_items)
		? payload.line_items.map(record)
		: [];
	return text(
		lineItems.find(
			(value) => value.plan_id === planId && value.feature_id === null,
		)?.display_name,
	);
};

export const resolveApprovalDisplay = async ({
	env,
	executeTool = executeAutumnMcpTool,
	getToken,
	preview,
	request,
}: {
	env: AppEnv;
	executeTool?: typeof executeAutumnMcpTool;
	getToken: () => Promise<string>;
	preview: unknown;
	request?: Record<string, unknown>;
}) => {
	const customerId = text(request?.customer_id);
	const planId = text(request?.plan_id);
	const customize = record(customizeWithFreeTrial(request));
	const catalogPlans = Array.isArray(request?.plans)
		? request.plans.map(record)
		: [];
	const schedulePlans = [
		...(Array.isArray(request?.phases)
			? request.phases.flatMap((value) => {
					const plans = record(value).plans;
					return Array.isArray(plans) ? plans.map(record) : [];
				})
			: []),
		...(Array.isArray(request?.unscheduled_plans)
			? request.unscheduled_plans.map(record)
			: []),
	];
	const customizations = [
		customize,
		...catalogPlans,
		...schedulePlans.map((plan) => record(plan.customize)),
	];
	const needsFeatures =
		Boolean(text(request?.feature_id)) ||
		customizations.some((value) =>
			[
				value.items,
				value.add_items,
				value.remove_items,
				value.update_items,
			].some(Array.isArray),
		);
	const referencedPlanIds = [planId, ...catalogPlans, ...schedulePlans]
		.flatMap((value) => {
			const id =
				typeof value === "string" ? value : text(record(value).plan_id);
			return id ? [id] : [];
		})
		.filter((id, index, values) => values.indexOf(id) === index);
	const previewPlanNames = Object.fromEntries(
		referencedPlanIds.flatMap((id) => {
			const name = planNameFromPreview({ planId: id, preview });
			return name ? [[id, name]] : [];
		}),
	);
	const requestPlanNames = Object.fromEntries(
		catalogPlans.flatMap((plan) => {
			const id = text(plan.plan_id);
			const name = text(plan.name);
			return id && name ? [[id, name]] : [];
		}),
	);
	const knownPlanNames = { ...requestPlanNames, ...previewPlanNames };
	const basePlanIds = new Set([
		...(planId && customizeNeedsCurrentPlan(customize) ? [planId] : []),
		...schedulePlans.flatMap((plan) => {
			const id = text(plan.plan_id);
			return id && customizeNeedsCurrentPlan(customizeWithFreeTrial(plan))
				? [id]
				: [];
		}),
	]);
	const planIds = referencedPlanIds.filter(
		(id) => !knownPlanNames[id] || basePlanIds.has(id),
	);
	const token =
		customerId || planIds.length || needsFeatures ? getToken() : null;
	const fetchRecord = (toolName: string, request: Record<string, unknown>) =>
		token
			?.then(async (value) => {
				const result = await executeTool({
					env,
					token: value,
					toolName,
					args: { request },
				});
				const errorText = autumnMcpErrorText(result);
				if (errorText) throw new Error(errorText);
				return parsePreviewPayload(result);
			})
			.catch((error) => {
				logger.warn("Approval display lookup failed", {
					event: "leaf.approval_display_fetch_failed",
					data: {
						error: errorMessage(error).slice(0, 300),
						request,
						tool: toolName,
					},
				});
				return null;
			});
	const [customer, features, plans] = await Promise.all([
		customerId
			? fetchRecord("getCustomer", {
					customer_id: customerId,
					expand: ["subscriptions.plan"],
					with_autumn_id: false,
				})
			: null,
		needsFeatures ? fetchRecord("listFeatures", {}) : null,
		Promise.all(
			planIds.map(
				async (id) =>
					[id, record(await fetchRecord("getPlan", { plan_id: id }))] as const,
			),
		),
	]);
	const customerRecord = record(customer?.customer ?? customer);
	const planRecords = Object.fromEntries(
		plans.map(([id, value]) => [id, record(value.plan ?? value)]),
	);
	// The plan a change is diffed against is what the customer currently holds.
	// A customized subscription can differ from the catalog (price and items),
	// so the live subscription's plan wins and the catalog is the fallback.
	const subscriptionPlanByPlan = Object.fromEntries(
		getArray(customerRecord.subscriptions).flatMap((subscription) => {
			const entry = record(subscription);
			const planId = text(entry.plan_id);
			const plan = record(entry.plan);
			return planId && Object.keys(plan).length ? [[planId, plan]] : [];
		}),
	);
	const currentPlanByPlan = {
		...planRecords,
		...subscriptionPlanByPlan,
	};
	const basePlanItemsByPlan = Object.fromEntries(
		Object.entries(currentPlanByPlan).flatMap(([id, value]) =>
			Array.isArray(value.items) ? [[id, value.items]] : [],
		),
	);
	const fetchedPlanNames = Object.fromEntries(
		Object.entries(planRecords).flatMap(([id, value]) => {
			const name = text(value.name);
			return name ? [[id, name]] : [];
		}),
	);
	const planNames = { ...fetchedPlanNames, ...knownPlanNames };
	const featureNames = Object.fromEntries(
		(Array.isArray(features?.list) ? features.list : []).flatMap((value) => {
			const feature = record(value);
			const id = text(feature.id);
			const display = record(feature.display);
			return id
				? [
						[
							id,
							{
								name: text(feature.name),
								plural: text(display.plural),
								singular: text(display.singular),
							},
						],
					]
				: [];
		}),
	);

	return {
		basePlanItems: planId ? (basePlanItemsByPlan[planId] ?? null) : null,
		...(Object.keys(basePlanItemsByPlan).length ? { basePlanItemsByPlan } : {}),
		currentPlan: planId ? (currentPlanByPlan[planId] ?? null) : null,
		...(Object.keys(currentPlanByPlan).length ? { currentPlanByPlan } : {}),
		customerEmail: text(customerRecord.email),
		customerName: text(customerRecord.name),
		...(Object.keys(featureNames).length ? { featureNames } : {}),
		planName: planId ? (planNames[planId] ?? null) : null,
		...(Object.keys(planNames).length ? { planNames } : {}),
	};
};

const isFailedPreview = (preview: unknown) =>
	Boolean(
		preview &&
			typeof preview === "object" &&
			(preview as { failed?: unknown }).failed === true,
	);

export const withApprovalDisplay = ({
	display,
	preview,
}: {
	display: Awaited<ReturnType<typeof resolveApprovalDisplay>>;
	preview: unknown;
}) => {
	if (preview == null || isFailedPreview(preview)) return preview;
	return {
		_captured_at: Date.now(),
		...(Object.values(display).some(Boolean) ? { _display: display } : {}),
		preview,
	};
};
