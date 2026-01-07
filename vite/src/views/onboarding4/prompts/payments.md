## Add Autumn payment flow

Autumn handles Stripe checkout and plan changes. Add the payment flow to this codebase.

### Step 1: Detect my integration type

Check if this codebase already has Autumn set up:
- If there's an `AutumnProvider` and `autumnHandler` mounted → Use **React hooks** (Path A)
- If there's just an `Autumn` client initialized → Use **Backend SDK** (Path B)

Tell me which path you'll follow before proceeding.

---

## Path A: React hooks

Use the `checkout` function from the `useCustomer` hook. This handles:
- Redirecting to Stripe checkout for new customers
- Showing a confirmation dialog for returning customers (card on file)
```tsx
import { useCustomer, CheckoutDialog } from "autumn-js/react";

export default function UpgradeButton() {
  const { checkout } = useCustomer();

  return (
    <button
      onClick={async () => {
        await checkout({
          productId: "pro", // your product ID from Autumn dashboard
          dialog: CheckoutDialog,
        });
      }}
    >
      Upgrade to Pro
    </button>
  );
}
```

The `CheckoutDialog` component automatically handles the case where the user already has a card on file and just needs to confirm the purchase/upgrade.

---

## Path B: Backend SDK

Payments are a 2-step process:

1. **checkout** - Returns either a Stripe checkout URL (new customer) or preview data (returning customer)
2. **attach** - Confirms the purchase when no checkout URL is returned

**TypeScript:**
```typescript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
  secretKey: process.env.AUTUMN_SECRET_KEY,
});

// Step 1: Get checkout info
const { data } = await autumn.checkout({
  customer_id: "user_or_org_id_from_auth",
  product_id: "pro",
});

if (data.url) {
  // Redirect user to Stripe checkout
  return redirect(data.url);
} else {
  // Card on file - show preview data to user for confirmation
  // data contains: { product, prices, preview }
  return data;
}

// Step 2: After user confirms (only if no URL was returned)
const { data: attachData } = await autumn.attach({
  customer_id: "user_or_org_id_from_auth",
  product_id: "pro",
});
```

**Python:**
```python
from autumn import Autumn

autumn = Autumn('am_sk_test_xxx')

# Step 1: Get checkout info
response = await autumn.checkout(
    customer_id="user_or_org_id_from_auth",
    product_id="pro"
)

if response.url:
    # Redirect user to Stripe checkout
    return redirect(response.url)
else:
    # Card on file - show preview to user for confirmation
    return response

# Step 2: After user confirms (only if no URL was returned)
attach_response = await autumn.attach(
    customer_id="user_or_org_id_from_auth",
    product_id="pro"
)
```

---

## Notes

- This handles upgrades, downgrades, and plan switches automatically
- Product IDs come from your Autumn dashboard (e.g., "free", "pro", "enterprise")
- You can pass `successUrl` to `checkout` to redirect users after payment completes
- To cancel a subscription: use `autumn.cancel({ customer_id, product_id })` (backend) or `cancel({ productId })` from `useCustomer` (React)

Docs: https://docs.useautumn.com/llms.txt

---

## Current Autumn Configuration
{{AUTUMN_CONFIG}}