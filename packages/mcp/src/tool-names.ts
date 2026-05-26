// Auto-generated at build time
export const toolNames: Array<{ name: string; description: string }>= [
  {
    "name": "get_customer",
    "description": "Get one Autumn customer by customer ID, with optional expanded fields."
  },
  {
    "name": "list_customers",
    "description": "List Autumn customers. Use the search field to find customers by ID, name, or email."
  },
  {
    "name": "get_plan",
    "description": "Get one Autumn plan by plan ID and optional version."
  },
  {
    "name": "list_plans",
    "description": "List Autumn plans. Optionally pass a customer ID to include customer eligibility."
  },
  {
    "name": "attach",
    "description": "Attach a plan to a customer. This may create or update subscriptions, invoices, or payment links. Call preview_attach first, show the billing impact to the user, and get explicit confirmation before calling this tool."
  },
  {
    "name": "preview_attach",
    "description": "Preview the billing impact of attaching a plan to a customer. This does not execute the attach."
  },
  {
    "name": "update_subscription",
    "description": "Update a customer subscription. This may change quantities, cancel, uncancel, invoice, or update billing state. Call preview_update_subscription first, show the billing impact to the user, and get explicit confirmation before calling this tool."
  },
  {
    "name": "preview_update_subscription",
    "description": "Preview the billing impact of updating a customer subscription. This does not execute the update."
  }
];
