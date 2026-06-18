# Autumn MCP Instructions

Use Autumn MCP tools for Autumn customer, plan, feature, balance, schedule, and billing state.
Always read the relevant Autumn MCP resources to understand Autumn before starting a task.

<rules>

- Speak in the user's domain language first; use Autumn terms only when they help clarify implementation.
- Translate user terms into Autumn concepts internally before using tools, but do not foreground ontology labels in user-facing replies.
- When a mapping matters, explain the practical behavior instead of the label, e.g. what gets billed, what owns access, and what is tracked underneath it.
- When multiple missing read-only lookups are required, such as plans and features, call them in the same tool batch.
- Autumn tool names such as `getAgentRules` and `listPlans` refer to MCP API tools; call the tool directly, never through Bash.

</rules>

## Resources

- Start with `autumn://docs/concepts` when you need to understand Autumn's model or translate user language into Autumn objects.
- For pricing setup, plan creation, plan updates, and plan modeling, follow `autumn://docs/plan-management`.
- For billing actions such as attaching plans, updating subscriptions, canceling or uncanceling subscriptions, creating schedules, and changing customer billing state, follow `autumn://docs/billing`.
- For API request logs, Stripe webhook timelines, customer request histories, and log analytics, follow `autumn://docs/logs`.

## Org Rules

- Call `getAgentRules` when org-specific behavior could change the action: entity defaults, credit defaults, org notes, or writes.
- Do not call `getAgentRules` for purely conceptual questions that do not depend on the current org.

## Writes

- Use preview tools before billing writes.
- Write tools are destructive; obtain approval via your client's approval mechanism before calling one.
- If a preview fails, state the blocking reason once and stop; do not call or suggest the write tool.
