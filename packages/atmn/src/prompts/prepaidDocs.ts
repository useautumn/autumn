export const prepaidDocs = `

# Prepaid top-ups

> Let customers purchase prepaid packages and top-ups.

If a user hits a usage limit you granted them, they may be willing to purchase a top-up.

These are typically one-time purchases (or less commonly, recurring add-ons) that grant a fixed usage of a feature.

This gives users full spend control and allows your business to be paid upfront. For these reasons, it tends to be a more popular alternative to usage-based pricing -- eg, OpenAI uses this model for their API.

## Example case

In this example, we have an AI chatbot that offers:

* 10 premium messages for free
* An option for customers to top-up premium messages in packages of $10 per 100 messages.

## Configure Pricing

<Steps>
  <Step>
    #### Create Features

    Create a \`metered\` \`consumable\` feature for our premium messages, so we can track its balance.

    <Frame>
      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=7d51661d2e27ba1f0c8dcbafe7e26cf5" className="block dark:hidden" data-og-width="1128" width="1128" data-og-height="292" height="292" data-path="assets/guides/prepaid/features-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=d54dfa034d29e0e4a1223bc70bf161b0 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=c9ba4ccf01f80db253eda16a13b67ffd 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=2831cd73822a2917c0c623901d0db448 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=17bff4662f924660ff190afa9a4ac714 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=78b20f0dde3d8de292eef45c4f71798c 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-light.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=a3562a182e22d62a3ee3a7499e6f9ae5 2500w" />

      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=46e63f36c563c947c323d59d88d4dee5" className="hidden dark:block" data-og-width="1138" width="1138" data-og-height="298" height="298" data-path="assets/guides/prepaid/features-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=529040483e4f8c4a0a74605d2f787558 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=2a9a7b6c0f017ccfa08c4fe05dac7c97 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=f2a31b84629229a3fb42d750352e0312 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=3304704796e7376f0ebb303d0819265e 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=66ebaae97cf4f81d005fd10bb32398fc 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/features-dark.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=139ebfbf2e7b3f3067d3e1c893eecc9f 2500w" />
    </Frame>
  </Step>

  <Step>
    #### Create Free and Top-up Plans

    Create our free plan, and assign 10 premium messages to it. These are "one-off" credits, that will not reset periodically.

    <Tip>
      Make sure to set the \`auto-enable\` flag on the free plan, so that it is automatically assigned to new customers.
    </Tip>

    <Frame>
      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=0a0c4dc3070a689e0a37cf9db6bbe003" className="block dark:hidden" data-og-width="1262" width="1262" data-og-height="518" height="518" data-path="assets/guides/prepaid/free-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=ec21ed1330917d23eb1f750127e23452 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=8d8047fa514b6aa1d853cef259ca14cc 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=72a9d26668712eaef8bf16e7f948d228 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=4797ce0fd5cfe702f019f39f00d15f7d 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=0521e3d328a84b760e1535b7a5bd9f20 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-light.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=bd57d59f066d9075ddcd115a9539991e 2500w" />

      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=e7c4a18129533d976c97f3e6f899dd5f" className="hidden dark:block" data-og-width="1302" width="1302" data-og-height="534" height="534" data-path="assets/guides/prepaid/free-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=fe5774aa4ed885b2f0259831c5d848d3 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=cc8630ef5f921c527b2798cfd042710a 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=651d5be440c865e4dedc227660fd623f 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=af7ab38d1bd0fca672fe2cb7d38db32a 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=97154c5b887d1152667717d0ccab3a60 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/free-dark.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=90b96fe496eafb60a0e590dd5b547810 2500w" />
    </Frame>

    Now we'll create our top-up plan. We'll add a price to our premium messages feature, at $10 per 100 messages. These are "one-off" purchases, with a \`prepaid\` billing method.

    \`prepaid\` features require a \`quantity\` to be sent in when a customer attaches this product, so the customer can specify how many premium messages they want to top up with.

    <Frame>
      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=080df829cf28a99c78a42c214c9aa6b0" className="block dark:hidden" data-og-width="1828" width="1828" data-og-height="1488" height="1488" data-path="assets/guides/prepaid/topup-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=261f79b4a45ce98eab3d7e5bd310d277 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=c740e2c6c421e17ff1dfde6e12d9cdf6 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=9810f426e38655448b47e1b66ae26124 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=5bafa09596f46fea9984a0de6393b5d4 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=dcf647b6b8d4ba24ac17c180d8cf3f3f 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-light.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=3e52534b34a58fc8a12bf9892dbaa7b1 2500w" />

      <img src="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=083d64784c2abb76cfd147a829eeb1c5" className="hidden dark:block" data-og-width="1824" width="1824" data-og-height="1498" height="1498" data-path="assets/guides/prepaid/topup-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=280&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=ec40cfd05340fa7537bf954168db3547 280w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=560&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=0bbd4b8c2816c16e9bd118a2bfb523d8 560w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=840&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=637c076a3c696957f2eee3c46f0a5bbe 840w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=1100&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=ba7b4d72576832cc91c09712c7bdf99b 1100w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=1650&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=7b7334526aed1489605b6c95f0942697 1650w, https://mintcdn.com/autumn/s33U5Ef8txzRP-3W/assets/guides/prepaid/topup-dark.png?w=2500&fit=max&auto=format&n=s33U5Ef8txzRP-3W&q=85&s=f24b74fefc853031a1fa981c9b95bd28 2500w" />
    </Frame>
  </Step>
</Steps>

## Implementation

<Steps>
  <Step>
    #### Create an Autumn Customer

    When your user signs up, create an Autumn customer. This will automatically assign them the Free plan, and grant them 10 premium messages.

    <CodeGroup>
      \`\`\`jsx React
      import { useCustomer } from "autumn-js/react";

      const App = () => {
        const { customer } = useCustomer();

        console.log("Autumn customer:", customer);

        return <h1>Welcome, {customer?.name || "user"}!</h1>;
      };
      \`\`\`

      \`\`\`typescript Node.js
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      const { data, error } = await autumn.customers.create({
        id: "user_or_org_id_from_auth",
        name: "John Yeo",
        email: "john@example.com",
      });
      \`\`\`

      \`\`\`python Python
      import asyncio
      from autumn import Autumn

      autumn = Autumn('am_sk_42424242')

      async def main():
          customer = await autumn.customers.create(
              id="user_or_org_id_from_auth",
              name="John Yeo",
              email="john@example.com",
          )

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL
      curl --request POST \
        --url https://api.useautumn.com/customers \
        --header 'Authorization: Bearer am_sk_42424242' \
        --header 'Content-Type: application/json' \
        --data '{
          "id": "user_or_org_id_from_auth",
          "name": "John Yeo",
          "email": "john@example.com"
        }'
      \`\`\`
    </CodeGroup>
  </Step>

  <Step>
    #### Checking for access

    Every time our user wants to send a premium message, we'll first check if they have enough premium messages remaining.

    <CodeGroup>
      \`\`\`jsx React wrap
      import { useCustomer } from "autumn-js/react";

      export function CheckPremiumMessage() {
        const { check, refetch } = useCustomer();

        const handleCheckAccess = async () => {
          const { data } = await check({ featureId: "premium-messages" });

          if (!data?.allowed) {
            alert("You've run out of premium messages");
          } else {
            // proceed with sending message
            await refetch();
          }
        };
      }
      \`\`\`

      \`\`\`typescript Node.js theme={null}
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      const { data } = await autumn.check({
        customer_id: "user_or_org_id_from_auth",
        feature_id: "premium_messages",
      });

      if (!data.allowed) {
        console.log("User has run out of premium messages");
        return;
      }
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_1234567890")

      async def main():
          response = await autumn.check(
              customer_id="user_or_org_id_from_auth",
              feature_id="premium_messages",
          )
          
          if not response.allowed:
              print("User has run out of premium messages")
              return

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/check" \
        -H "Authorization: Bearer am_sk_1234567890" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "feature_id": "premium_messages"
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="check response">
      \`\`\`json  theme={null}
      {
        "customer_id": "user_or_org_id_from_auth",
        "feature_id": "premium_messages",
        "code": "feature_found",
        "allowed": true,
        "balance": 10,
        "usage": 0,
        "included_usage": 10,
        "unlimited": false,
        "interval": null,
        "interval_count": 1,
        "next_reset_at": null,
        "overage_allowed": false
      }
      \`\`\`
    </Expandable>
  </Step>

  <Step>
    #### Tracking premium messages

    Now let's implement our usage tracking and use up our premium messages. In this example, we're using 5 premium messages.

    <CodeGroup>
      \`\`\`typescript Node.js theme={null}
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      await autumn.track({
        customer_id: "user_or_org_id_from_auth",
        feature_id: "premium_messages",
        value: 5,
      });
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          await autumn.track(
              customer_id="user_or_org_id_from_auth",
              feature_id="premium_messages",
              value=5,
          )

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/track" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "feature_id": "premium_messages",
          "value": 5
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="track response">
      \`\`\`json  theme={null}
      {
        "code": "event_received",
        "customer_id": "user_or_org_id_from_auth",
        "feature_id": "premium_messages"
      }
      \`\`\`
    </Expandable>
  </Step>

  <Step>
    #### Purchasing top-ups

    When users run out of premium messages, they can purchase additional messages using our top-up plan. In this example, the user is purchasing 200 premium messages, which will cost them $20.

    <CodeGroup>
      \`\`\`jsx React theme={null}
      import { useCustomer, CheckoutDialog } from "autumn-js/react";

      export default function TopUpButton() {
        const { checkout } = useCustomer();

        return (
          <button
            onClick={async () => {
              await checkout({
                productId: "top_up",
                dialog: CheckoutDialog,
                options: [{
                  featureId: "premium_messages",
                  quantity: 200,
                }],
              });
            }}
          >
            Buy More Messages
          </button>
        );
      }
      \`\`\`

      \`\`\`typescript Node.js theme={null}
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      const { data } = await autumn.checkout({
        customer_id: "user_or_org_id_from_auth",
        product_id: "top_up",
        options: [{
          feature_id: "premium_messages",
          quantity: 200,
        }],
      });

      if (data.url) {
        // Redirect user to Stripe checkout URL
      } else {
        // Show purchase preview to user
      }
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          response = await autumn.checkout(
              customer_id="user_or_org_id_from_auth",
              product_id="top-up",
              options=[{
                "feature_id": "premium-messages",
                "quantity": 200,
              }],
          )
          
          if response.url:
              # Redirect user to Stripe checkout URL
              pass
          else:
              # Show purchase preview to user
              pass

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/checkout" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "product_id": "top-up",
          "options": [{
            "feature_id": "premium-messages",
            "quantity": 200
          }]
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="checkout response">
      \`\`\`json  theme={null}
      {
        "customer_id": "user_or_org_id_from_auth",
        "lines": [
          {
            "description": "Top-up - 200 premium messages",
            "amount": 20,
            "item": {
              "type": "feature",
              "feature_id": "premium-messages",
              "feature_type": "prepaid",
              "feature": {
                "id": "premium-messages",
                "name": "Premium messages",
                "type": "metered",
                "display": {
                  "singular": "premium message",
                  "plural": "premium messages"
                }
              },
              "quantity": 200,
              "price": 10,
              "price_per": 100,
              "display": {
                "primary_text": "200 premium messages",
                "secondary_text": "$10 per 100 messages"
              }
            }
          }
        ],
        "product": {
          "id": "top-up",
          "name": "Top-up",
          "group": null,
          "env": "sandbox",
          "is_add_on": false,
          "is_default": false,
          "archived": false,
          "version": 1,
          "created_at": 1766428038264,
          "items": [
            {
              "type": "feature",
              "feature_id": "premium-messages",
              "feature_type": "prepaid",
              "feature": {
                "id": "premium-messages",
                "name": "Premium messages",
                "type": "metered",
                "display": {
                  "singular": "premium message",
                  "plural": "premium messages"
                }
              },
              "price": 10,
              "price_per": 100,
              "display": {
                "primary_text": "$10 per 100 messages"
              }
            }
          ],
          "free_trial": null,
          "base_variant_id": null,
          "scenario": "attach",
          "properties": {
            "is_free": false,
            "is_one_off": true,
            "has_trial": false,
            "updateable": false
          }
        },
        "total": 20,
        "currency": "usd",
        "url": "https://checkout.stripe.com/c/pay/.......",
        "has_prorations": false
      }
      \`\`\`
    </Expandable>

    Once the customer completes the payment, they will have an additional 200 premium messages available to use. You can display to the user by getting balances from the \`customer\` method.
  </Step>
</Steps>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.useautumn.com/llms.txt

`;
