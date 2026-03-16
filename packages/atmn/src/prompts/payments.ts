import { prepaidDocs } from "./prepaidDocs.js";

export const paymentsPrompt = `## Add Autumn payment flow

Autumn handles Stripe checkout and plan changes. Your task is to add the payment flow to this codebase for ALL plans in the Autumn configuration.

### Step 1: Detect my integration type

Check if this codebase already has Autumn set up:
- If there's an \`AutumnProvider\` and \`autumnHandler\` mounted → **Path A: React**
- If there's just an \`Autumn\` client initialized → **Path B: Backend SDK**

Before implementing:
1. Tell me which path you'll follow before proceeding.
2. Tell me that I will be building pricing cards to handle billing flows, and ask for any guidance or any input

---

## Path A: React

### Checkout Flow

Use \`checkout\` from \`useCustomer\`. It returns either a Stripe URL (new customer) or checkout preview data (returning customer with card on file).

\`\`\`tsx
import { useCustomer } from "autumn-js/react";

const { checkout } = useCustomer();

const data = await checkout({ productId: "pro" });

if (!data.url) {
  // Returning customer → show confirmation dialog with result data
  // data contains: { product, current_product, lines, total (IN MAJOR CURRENCY), currency, next_cycle }
}
\`\`\`

After user confirms in your dialog, call \`attach\` to enable plan (and charge card as needed)

\`\`\`tsx
const { attach } = useCustomer();

await attach({ productId: "pro" });
\`\`\`

### Getting Billing State

Use \`usePricingTable\` to get products with their billing scenario and display state.

\`\`\`tsx
import { usePricingTable } from "autumn-js/react";

function PricingPage() {
  const { products } = usePricingTable();
  // Each product has: scenario, properties
  // scenario: "scheduled" | "active" | "new" | "renew" | "upgrade" | "downgrade" | "cancel"
}
\`\`\`

### Canceling
Only use this if there is no free plan in the user's Autumn config. If there is a free plan, then you can cancel by attaching the free plan.

\`\`\`tsx
const { cancel } = useCustomer();
await cancel({ productId: "pro" });
\`\`\`

---

## Path B: Backend SDK

### Checkout Flow

Payments are a 2-step process:
1. **checkout** - Returns Stripe checkout URL (new customer) or preview data (returning customer)
2. **attach** - Confirms purchase when no URL was returned

**TypeScript:**
\`\`\`typescript
import { Autumn } from "autumn-js";
import type { CheckoutResult, AttachResult } from "autumn-js";

const autumn = new Autumn({ secretKey: process.env.AUTUMN_SECRET_KEY });

// Step 1: Get checkout info
const { data } = await autumn.checkout({
  customer_id: "user_or_org_id_from_auth",
  product_id: "pro",
}) as { data: CheckoutResult };

if (data.url) {
  // New customer → redirect to Stripe
  return redirect(data.url);
} else {
  // Returning customer → return preview data for confirmation UI
  // data contains: { product, current_product, lines, total (IN MAJOR CURRENCY), currency, next_cycle }
  return data;
}

// Step 2: After user confirms (only if no URL)
const { data: attachData } = await autumn.attach({
  customer_id: "user_or_org_id_from_auth",
  product_id: "pro",
}) as { data: AttachResult };
\`\`\`

**Python:**
\`\`\`python
from autumn import Autumn

autumn = Autumn('am_sk_test_xxx')

# Step 1: Get checkout info
response = await autumn.checkout(
    customer_id="user_or_org_id_from_auth",
    product_id="pro",
)

if response.url:
    # New customer → redirect to Stripe
    return redirect(response.url)
else:
    # Returning customer → return preview data for confirmation UI
    return response

# Step 2: After user confirms
attach_response = await autumn.attach(
    customer_id="user_or_org_id_from_auth",
    product_id="pro",
)
\`\`\`

For prepaid pricing options, see the end of this message.

### Getting Billing State

Use \`products.list\` with a \`customer_id\` to get products with their billing scenario. **Don't build custom billing state logic.**

**TypeScript:**
\`\`\`typescript
const { data } = await autumn.products.list({
  customer_id: "user_or_org_id_from_auth",
});

data.list.forEach((product) => {
  const { scenario } = product;
  // "scheduled" | "active" | "new" | "renew" | "upgrade" | "downgrade" | "cancel"
});
\`\`\`

**Python:**
\`\`\`python
response = await autumn.products.list(customer_id="user_or_org_id_from_auth")

for product in response.list:
    scenario = product.scenario
\`\`\`

**curl:**
\`\`\`bash
curl https://api.useautumn.com/v1/products?customer_id=user_or_org_id_from_auth \\
  -H "Authorization: Bearer $AUTUMN_SECRET_KEY"
\`\`\`

### Canceling

\`\`\`typescript
await autumn.cancel({ customer_id: "...", product_id: "pro" });
\`\`\`

Or attach a free product ID to downgrade.

---

## Common Patterns

### Pricing Button Text

\`\`\`typescript
const SCENARIO_TEXT: Record<string, string> = {
  scheduled: "Plan Scheduled",
  active: "Current Plan",
  renew: "Renew",
  upgrade: "Upgrade",
  new: "Enable",
  downgrade: "Downgrade",
  cancel: "Cancel Plan",
};

export const getPricingButtonText = (product: Product): string => {
  const { scenario, properties } = product;
  const { is_one_off, updateable, has_trial } = properties ?? {};

  if (has_trial) return "Start Trial";
  if (scenario === "active" && updateable) return "Update";
  if (scenario === "new" && is_one_off) return "Purchase";

  return SCENARIO_TEXT[scenario ?? ""] ?? "Enable Plan";
};
\`\`\`

### Confirmation Dialog Text

\`\`\`typescript
import type { CheckoutResult, Product } from "autumn-js";

export const getConfirmationTexts = (result: CheckoutResult): { title: string; message: string } => {
  const { product, current_product, next_cycle } = result;
  const scenario = product.scenario;
  const productName = product.name;
  const currentProductName = current_product?.name;
  const nextCycleDate = next_cycle?.starts_at 
    ? new Date(next_cycle.starts_at).toLocaleDateString() 
    : undefined;

  const isRecurring = !product.properties?.is_one_off;

  const CONFIRMATION_TEXT: Record<string, { title: string; message: string }> = {
    scheduled: { title: "Already Scheduled", message: "You already have this product scheduled." },
    active: { title: "Already Active", message: "You are already subscribed to this product." },
    renew: { title: "Renew", message: \`Renew your subscription to \${productName}.\` },
    upgrade: { title: \`Upgrade to \${productName}\`, message: \`Upgrade to \${productName}. Your card will be charged immediately.\` },
    downgrade: { title: \`Downgrade to \${productName}\`, message: \`\${currentProductName} will be cancelled. \${productName} begins \${nextCycleDate}.\` },
    cancel: { title: "Cancel", message: \`Your subscription to \${currentProductName} will end \${nextCycleDate}.\` },
  };

  if (scenario === "new") {
    return isRecurring
      ? { title: \`Subscribe to \${productName}\`, message: \`Subscribe to \${productName}. Charged immediately.\` }
      : { title: \`Purchase \${productName}\`, message: \`Purchase \${productName}. Charged immediately.\` };
  }

  return CONFIRMATION_TEXT[scenario ?? ""] ?? { title: "Change Subscription", message: "You are about to change your subscription." };
};
\`\`\`

---

## Notes

- **NB: the result is \`data.url\`, NOT \`data.checkout_url\`**
- This handles all upgrades, downgrades, renewals, uncancellations automatically
- Product IDs come from the Autumn configuration
- Pass \`successUrl\` to \`checkout\` to redirect users after payment
- For prepaid pricing examples, see the end of this message.

**Note:** Your Autumn configuration is in \`autumn.config.ts\` in your project root.

Docs: https://docs.useautumn.com/llms.txt

<Prepaid Documentation>
${prepaidDocs}
</Prepaid Documentation>
`;
