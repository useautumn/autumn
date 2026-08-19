import { parsePreviewPayload } from "@autumn/render";
import type { AppEnv } from "@autumn/shared";
import { executeAutumnMcpTool } from "../../autumnMcp/client.js";

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
	const customize = record(request?.customize);
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
	const needsBasePlan = (value: Record<string, unknown>) =>
		Array.isArray(value.items) || Array.isArray(value.remove_items);
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
		...(planId && needsBasePlan(customize) ? [planId] : []),
		...schedulePlans.flatMap((plan) => {
			const id = text(plan.plan_id);
			return id && needsBasePlan(record(plan.customize)) ? [id] : [];
		}),
	]);
	const planIds = referencedPlanIds.filter(
		(id) => !knownPlanNames[id] || basePlanIds.has(id),
	);
	const token =
		customerId || planIds.length || needsFeatures ? getToken() : null;
	const fetchRecord = (toolName: string, request: Record<string, unknown>) =>
		token
			?.then((value) =>
				executeTool({ env, token: value, toolName, args: { request } }),
			)
			.then(parsePreviewPayload)
			.catch(() => null);
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
	// A remove_items filter names a feature; the quantity being removed is what
	// the customer currently holds, which a customized subscription can set
	// differently from the catalog plan. Prefer the live subscription's items.
	const subscriptionItemsByPlan = Object.fromEntries(
		getArray(customerRecord.subscriptions).flatMap((subscription) => {
			const entry = record(subscription);
			const planId = text(entry.plan_id);
			const items = record(entry.plan).items;
			return planId && Array.isArray(items) ? [[planId, items]] : [];
		}),
	);
	const basePlanItemsByPlan = Object.fromEntries(
		Object.entries(planRecords).flatMap(([id, value]) => {
			const items = subscriptionItemsByPlan[id] ?? value.items;
			return Array.isArray(items) ? [[id, items]] : [];
		}),
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
		customerEmail: text(customerRecord.email),
		customerName: text(customerRecord.name),
		...(Object.keys(featureNames).length ? { featureNames } : {}),
		planName: planId ? (planNames[planId] ?? null) : null,
		...(Object.keys(planNames).length ? { planNames } : {}),
	};
};

export const withApprovalDisplay = ({
	display,
	preview,
}: {
	display: Awaited<ReturnType<typeof resolveApprovalDisplay>>;
	preview: unknown;
}) =>
	Object.values(display).some(Boolean)
		? { _display: display, preview }
		: preview;
