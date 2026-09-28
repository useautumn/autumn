## Setup and payments

In this example we'll create the pricing for a premium AI chatbot. We're going to have:

- A <Badge color="green">Free</Badge> plan that gives users 5 chat messages per month for free
- A <Badge color="blue">Pro</Badge> plan that gives users 100 chat messages per month for $20 per month.

<Steps>
<Step title="Create your pricing plans">
Create a plan for each pricing tier that your app offers. In our example we'll create a "Free" and "Pro" plan, and assign them features.

Browse our [Examples](/examples) for guides on setting up credit systems, top ups and other common pricing models.

Run the following command in your root directory:

<CodeGroup>
```bash bun
bunx atmn init
```
```bash npm
npx atmn init
```
```bash pnpm
pnpm dlx atmn init
```
</CodeGroup>

This asks how you want to connect (sign in, or create a sandbox with no account), then creates an `autumn/` folder with an `autumn.config.ts` inside. Replace the contents of that file with the code below, or view our [config reference](/cli/config) to build your own.

```typescript autumn.config.ts [expandable]
import { atmn, feature, plan } from "atmn";

// Features
export const messages = feature({
  featureId: "messages",
  name: "Messages",
  type: "metered",
  consumable: true,
});

// Plans
export const free = plan({
  planId: "free",
  versionSlug: "v1",
  active: true,
  name: "Free",
  autoEnable: true,
  items: [
    // 5 messages per month
    {
      featureId: messages.featureId,
      included: 5,
      reset: { interval: "month" },
    },
  ],
});

export const pro = plan({
  planId: "pro",
  versionSlug: "v1",
  active: true,
  name: "Pro",
  price: {
    amount: 20,
    interval: "month",
  },
  items: [
    // 100 messages per month
    {
      featureId: messages.featureId,
      included: 100,
      reset: { interval: "month" },
    },
  ],
});

export default atmn({ features: [messages], plans: [free, pro] });
```

Then, preview your changes against Autumn's sandbox environment.

<CodeGroup>
```bash bun
bunx atmn push
```
```bash npm
npx atmn push
```
```bash pnpm
pnpm dlx atmn push
```
</CodeGroup>

Once the preview looks right, apply it:

<CodeGroup>
```bash bun
bunx atmn push --yes
```
```bash npm
npx atmn push --yes
```
```bash pnpm
pnpm dlx atmn push --yes
```
</CodeGroup>

  If you already have plans created in the dashboard, `atmn init` pulls them
  into your config for you. Run `atmn pull` at any time to do it again.

</Step>

<Step title="Installation">
[Create an Autumn Secret key](https://app.useautumn.com/sandbox/dev?tab=api_keys), and paste it in your `.env` variables. Then, install the Autumn SDK. If you're using the CLI, this will be done for you.

```bash .env
AUTUMN_SECRET_KEY=am_sk_test_42424242...
```

<CodeGroup>

```bash bun
bun add autumn-js
```

```bash npm
npm install autumn-js
```

```bash pnpm
pnpm add autumn-js
```

```bash yarn
yarn add autumn-js
```

```bash pip
pip install autumn-sdk
```

</CodeGroup>

</Step>

<Step title="Create an Autumn customer">
When the customer signs up, create an Autumn customer for them. Autumn will automatically enable the <Badge color="green">Free</Badge> plan, since you marked it with the `auto-enable` flag.

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
    secretKey: "am_sk_42424242",
});

const customer = await autumn.customers.getOrCreate({
    customerId: "user_or_org_id_from_auth",
    name: "John Doe",
    email: "john@example.com",
});
```

```python Python
import asyncio
from autumn_sdk import Autumn

autumn = Autumn('am_sk_42424242')

async def main():
    customer = await autumn.customers.get_or_create(
        customer_id="user_or_org_id_from_auth",
        name="John Doe",
        email="john@example.com",
    )

asyncio.run(main())
```

```bash cURL
curl --request POST \
  --url https://api.useautumn.com/v1/customers \
  --header 'Authorization: Bearer am_sk_42424242' \
  --header 'Content-Type: application/json' \
  --data '{
  "customer_id": "user_or_org_id_from_auth",
  "name": "John Doe",
  "email": "john@example.com"
}'
```

</CodeGroup>

    Autumn's customer ID is the same as your internal user or org ID generated
    from your auth provider. No need to store any extra IDs.

In the Autumn dashboard, you will see your user under the [customers](https://app.useautumn.com/customers) page.

</Step>

<Step title="Stripe Payment Flow">
Call `attach` when the customer wants to purchase the <Badge color="blue">Pro</Badge> plan. This will return a Stripe payment URL. Once they've paid, Autumn will grant access to "100 messages per month" defined in Step 1.

<CodeGroup>

```typescript TypeScript
import { Autumn } from "autumn-js";

const autumn = new Autumn({
    secretKey: "am_sk_42424242",
});

const response = await autumn.billing.attach({
    customerId: "user_or_org_id_from_auth",
    planId: "pro",
    redirectMode: "always",
});

// Redirect customer to complete payment or confirm plan change
redirect(response.paymentUrl);
```

```python Python
import asyncio
from autumn_sdk import Autumn

autumn = Autumn('am_sk_42424242')

async def main():
  response = await autumn.billing.attach(
      customer_id='user_or_org_id_from_auth',
      plan_id='pro',
      redirect_mode='always',
  )

asyncio.run(main())
```

```bash cURL
curl -X POST 'https://api.useautumn.com/v1/attach' \
-H 'Authorization: Bearer am_sk_42424242' \
-H 'Content-Type: application/json' \
-d '{
  "customer_id": "user_or_org_id_from_auth",
  "plan_id": "pro",
  "redirect_mode": "always"
}'
```

</CodeGroup>

    Use Stripe's test card `4242 4242 4242 4242` to make a purchase in sandbox.
    You can enter any Expiry and CVV.

This can be used for any plan changes scenario (upgrades, downgrades, one-time topups, renewals, etc).

Upgrades will happen immediately, and downgrades will be scheduled for the next billing cycle.

The **`redirectMode: "always"`** flag will always return a payment URL.

New purchases redirect to Stripe Checkout to enter payment details, and subsequent charges redirect to an Autumn hosted, one-click confirmation page.

You can build your own billing confirmation flows by using the [previewAttach](/api-reference/billing/previewAttach) function.

</Step>
</Steps>

**Next: Track and limit usage**

Now that the plan is enabled and you've handled payments, you can now make sure that customers have the access to the right features and limits based on their plan.

    Enforce usage limits and feature permissions using Autumn's `check` and
    `track` functions
