# Autumn

<img width="1983" height="793" alt="image" src="https://github.com/user-attachments/assets/f2b6271d-19af-4b16-be73-b55a3303b7f1" />


[![Discord](https://img.shields.io/badge/Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/53emPtY9tA)
[![Follow](https://img.shields.io/twitter/follow/autumnpricing?style=social)](https://x.com/autumnpricing)
[![Y Combinator](https://img.shields.io/badge/Y%20Combinator-F24-orange)](https://www.ycombinator.com/companies/autumn)
[![Cloud](https://img.shields.io/badge/Cloud-☁️-blue)](https://app.useautumn.com)
[![Documentation](https://img.shields.io/badge/Documentation-📕-blue)](https://docs.useautumn.com)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/useautumn/autumn)

[Autumn](https://useautumn.com) is an open-source layer between Stripe and your application, allowing you to create any pricing model and embed it with a couple lines of code. On Autumn you can build:
- Subscriptions
- Credit systems & top ups
- Usage-based models & overages
- Custom plans for large customers

All this without having to handle webhooks, upgrades/downgrades, cancellations or payment fails.


## Getting Started

**Cloud**: The quickest way to start using Autumn is through our [cloud service](https://app.useautumn.com). 

**Self Hosted**: If you'd like to self-host Autumn:

1. Make sure you have `bun` installed
2. Install the project dependencies:
```bash
bun install
```
3. Run Autumn:
```bash
bun dev
```

That's it! You should be able to see the Autumn dashboard on `http://localhost:3000`. 

> ℹ️ Autumn depends on a bunch of services. If you'd like help with self-hosting or running a local instance, contact the team on [Discord](https://discord.gg/53emPtY9tA).

> ⚠️ To log in, enter an email at the sign in page, and an OTP should appear in your console / terminal. Normally, we use Resend to email an OTP or Google OAuth -- these can be set up by providing your credentials in `server/.env`

> ℹ️ If you'd like to use your own Postgres instance, paste the connection string in the `DATABASE_URL` env variable at `server/.env`

## Why Autumn

**1️⃣ Billing infra gets complex fast**

More than payments: it's building permission management, metering, usage limits with cron jobs, and connecting it to upgrade, downgrade, cancellation and failed payments states. Race conditions, edge cases, and other bugs will slow you down.

**2️⃣ Billing and app logic should be decoupled**

Growing companies iterate on pricing often: raising prices, experimenting with credits or charging for a new feature. DB migrations, rebuilding in-app flows, internal dashboards for custom pricing and grandfathering users on old pricing is a nightmare.


## How it works
First, create your products and plans on the dashboard. We support **any** pricing model. Some popular ones we've seen include:

1. **Usage & Overage** ⚡: set real-time usage limits and choose when they reset. Charge users if they go over.
2. **Credits** 💰: users can access monetary or arbitrary credits that many features can draw from
3. **Seat-based with per-seat limits** 👥:: bill customers for their users (or other entities)
4. **Pay upfront** 💳: let users purchase a fixed quantity of a feature upfront, which is used over time


Next, all your billing logic can be implemented through just 3 functions:

1. `/attach`: One function call for all purchase flows. We return a Stripe Checkout URL, or handle an upgrade/downgrade.

```tsx
const { attach } = useAutumn();
<button
  onClick={async () => {
    await attach({ productId: "pro" });
  }}
>
  Upgrade to Pro
</button>
```

2. `/check`: Check whether a customer has access to a product, feature or remaining usage.
```ts
const { check } = useAutumn();

const { data } = await check({ featureId: "ai_tokens" })

!data.allowed && alert("AI limit reached")
```

3. `/track`: When a customer uses a usage-based feature, record a usage event.

```ts
const { track } = useAutumn();

await track({
  featureId: "ai_tokens",
  value: 1312
})
```

## Others

**Contributing** 🤝: If you're interested in contributing, you can check out our guide [here](/.github/CONTRIBUTING.md). All types of help are appreciated :)

**Support** 💬: If you need any type of support, we're typically most responsive on our [Discord channel](https://discord.gg/STqxY92zuS), but feel free to email us `hey@useautumn.com` too!



<!-- ## Congratulations!

You've embedded a full billing system into your application within a few minutes. You can make any pricing model changes you need, or handle custom plans without needing to alter your codebase.

Feel free to self-host Autumn, or use our hosted version at https://useautumn.com. And let us know any questions, thoughts or feedback at hey@useautumn.com. -->

## Contributors

Thanks to all our contributors for helping make autumn a better product!

<a href="https://github.com/useautumn/autumn/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=useautumn/autumn" />
</a>
