import type { MCPServerResources } from "@mastra/mcp";

const docs = {
	"autumn://docs/tool-composition": {
		name: "tool-composition",
		title: "Tool Composition",
		description: "How to compose Autumn MCP tools for operational questions.",
		text: `# Tool Composition

Use Autumn tools as composable primitives.

- Use listPlans first for questions based on plan attributes.
- Use listCustomers for customer-heavy questions, with filters and pagination.
- Use getPlan or getCustomer only when list results are missing required detail.
- Do not fan out into many getCustomer calls unless the user needs per-customer details not present in listCustomers.
- Use createCustomer only when the user explicitly asks to create or pre-create a customer.
- Use createPlan for confirmed plan configuration writes.
- Use previewCreateSchedule before createSchedule for multi-phase billing schedules.
- For billing writes, always preview first and wait for explicit user confirmation before applying.`,
	},
	"autumn://docs/querying-plans": {
		name: "querying-plans",
		title: "Querying Plans",
		description: "How to answer plan-filtering questions with listPlans.",
		text: `# Querying Plans

listPlans is usually a cheap full scan because organizations generally have a small number of plans.

Use listPlans for questions about:
- plan price thresholds
- free trials
- archived plans
- custom plan variants
- plan versions
- plan features and included quantities

Filter the returned plans locally. If the user asks for customers on matching plans, first resolve the matching plans, then call listCustomers with those plan ids.`,
	},
	"autumn://docs/creating-plans": {
		name: "creating-plans",
		title: "Creating Plans",
		description: "How to gather plan details before using createPlan.",
		text: `# Creating Plans

Use createPlan only after the requested plan shape is clear.

Before creating a plan, resolve:
- plan_id and name
- whether it is a base plan or add-on
- base price, interval, and currency if paid
- items/features, included quantities, reset intervals, and item-level prices
- free trial settings
- whether the plan should auto-enable for new customers

If any required pricing or feature detail is ambiguous, ask a concise clarification question before creating the plan.`,
	},
	"autumn://docs/querying-customers": {
		name: "querying-customers",
		title: "Querying Customers",
		description: "How to answer customer-heavy questions with listCustomers.",
		text: `# Querying Customers

listCustomers is the primary primitive for customer-heavy queries.

Prefer server-side filters before local filtering:
- search: customer id, name, or email
- plans: customers attached to specific plans and versions
- subscription_status: active or scheduled subscriptions
- processors: payment processor filters

Always paginate until next_cursor is empty when the user asks for complete results. Use getCustomer only for details not returned by listCustomers.`,
	},
	"autumn://docs/schedules": {
		name: "schedules",
		title: "Billing Schedules",
		description: "How to create multi-phase billing schedules safely.",
		text: `# Billing Schedules

Use previewCreateSchedule and createSchedule for multi-phase future billing changes.

Before creating a schedule, resolve:
- customer_id and optional entity_id
- ordered phases with starts_at epoch milliseconds
- plans in each phase, including versions, feature quantities, and customizations
- redirect_mode, success_url, invoice_mode, and checkout behavior if payment may be required

There is no separate public update-schedule tool. For existing subscription changes, use previewUpdateSubscription and updateSubscription when the requested change fits that endpoint. For a new multi-phase transition, call previewCreateSchedule first, show the immediate billing impact and ordered phases, then call createSchedule only after explicit confirmation.`,
	},
	"autumn://docs/billing-safety": {
		name: "billing-safety",
		title: "Billing Safety",
		description: "Preview-first rules for Autumn billing changes.",
		text: `# Billing Safety

Billing mutations must be preview-first.

- Use previewAttach before attach.
- Use previewUpdateSubscription before updateSubscription.
- Use previewCreateSchedule before createSchedule.
- Use createSchedule only after the user confirms the ordered phases, timing, and preview.
- Use createPlan only after the user confirms the plan configuration.
- Show the user the material billing impact before applying a change.
- Apply a write only after explicit confirmation of the exact previewed change.
- Never claim a billing change was applied unless the write tool succeeds.`,
	},
} as const;

export const autumnMcpResources: MCPServerResources = {
	listResources: async () =>
		Object.entries(docs).map(([uri, doc]) => ({
			uri,
			name: doc.name,
			title: doc.title,
			description: doc.description,
			mimeType: "text/markdown",
			size: doc.text.length,
			annotations: {
				audience: ["assistant"],
				priority: 0.8,
			},
		})),
	getResourceContent: async ({ uri }) => {
		const doc = docs[uri as keyof typeof docs];
		if (!doc) throw new Error(`Unknown Autumn MCP resource: ${uri}`);
		return { text: doc.text };
	},
};

export const autumnMcpResourceUris = Object.keys(docs);
