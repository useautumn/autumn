export const creditSystemDocs = `
# Monetary credits

> Grant your users a currency-based balance of credits, that various features can draw from

When you have multiple features that cost different amounts, you can use a credit system to deduct usage from a single balance. This can be great to simplify billing and usage tracking, especially when you have lots of features.

## Example case

We have a AI chatbot product with 2 different models, and each model costs a different amount to use.

* Basic message: $1 per 100 messages
* Premium message: $10 per 100 messages

And we have the following plans:

* Free tier: $5 credits per month for free
* Pro tier: $10 credits per month, at $10 per month

Users should also be able to top up their balance with more credits.

## Configure Pricing

<Steps>
  <Step>
    #### Create Features

    Create a \`metered\` \`consumable\` feature for each message type, so that we can track the usage of each:

    <Frame>
      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=8ad6f333a2556a3a0917bee04e284b81" className="block dark:hidden" data-og-width="1070" width="1070" data-og-height="360" height="360" data-path="assets/guides/monetary-credits/features-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=3a4e016041c82b2f20a692d518100e69 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=3970dc71e6fadbad5bba1172c9411608 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=155f852f86832b4d1d842149575152cf 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=541ab4b35244cbec79bd463e9ef8ed55 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=1ac1565047e6af82cbb6d590219e350f 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-light.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=f246bd47edcdb6be84e2022f3f783391 2500w" />

      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=effa751e7f90b92522be0c3f06e50ad6" className="hidden dark:block" data-og-width="1080" width="1080" data-og-height="366" height="366" data-path="assets/guides/monetary-credits/features-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=bd04f7957b5a336db0543882519e11f3 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=ad9ec98189db3b8217685e9e4feb6e9a 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=b5990bbe24c226717b1e3ea756c7c5ee 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=f3c7adbc4a98597df64c504bc9d0cf3d 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=9b75fca0b89ed32f9174398bb3330f88 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/features-dark.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=bca42110fa6db4b7ea986e56f9213827 2500w" />
    </Frame>
  </Step>

  <Step>
    #### Create Credit System

    Now, we'll create a credit system, where we'll define the cost of each message type. We'll define the cost per message in USD:

    | Feature         | Cost per message (USD) | Credit cost per message (USD) |
    | --------------- | ---------------------- | ----------------------------- |
    | Basic message   | $1 per 100 messages   | 0.01                          |
    | Premium message | $10 per 100 messages  | 0.10                          |

    <Frame style={{ width: "400px" }}>
      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=282e723ee9a16d0d925829e4cf93d40c" className="block dark:hidden" data-og-width="878" width="878" data-og-height="770" height="770" data-path="assets/guides/monetary-credits/credit-system-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=fe7219a2d7be1cb1508708adfabab7b4 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=3f2c75336173fe5c56b31eeb4b56b4cf 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=13696bf61448875a0c9d093d9215cc80 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=3ffe1fd218aa822fceb12b73c6ed99ec 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=9cc1a7297d6413be48fbc1d24aa9dced 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-light.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=b0e663dbe4abb9608de40f45727b08d7 2500w" />

      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=24fe90d0b7de4030e5abfbfd3bfcc510" className="hidden dark:block" data-og-width="878" width="878" data-og-height="780" height="780" data-path="assets/guides/monetary-credits/credit-system-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=94646af7250125285af0761361fbf158 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=eb32f3f32c4efa925287dd9e2e2b8ac9 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=85b274aad733fdd80aeda185a90f982a 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=2f00363bab7740ed43226496cd43f605 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=ce02b334331a22194fb96ad4a8c9067e 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/credit-system-dark.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=6a6e6a98433f92f0df7ab9f00e61c4c0 2500w" />
    </Frame>
  </Step>

  <Step>
    #### Create Free, Pro and Top-up Plans

    Let's create our free and pro plans, and add the credits amounts to each.

    <Tip>
      Make sure to set the \`auto-enable\` flag on the free plan, so that it is automatically assigned to new customers.
    </Tip>

    <Frame style={{ width: "400px" }}>
      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=c2f3cb88b041b79058337be88fc5321c" className="block dark:hidden" data-og-width="1310" width="1310" data-og-height="574" height="574" data-path="assets/guides/monetary-credits/free-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=a7b39af8e8457fe57a8516ba9f9a956a 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=dfdd8ffe32bae8bbea97e330445182cf 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=4be516dcb4b63d37d08880b4800e76a7 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=1c11d91d7f7b76382db52cc2c6a7b206 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=c336fd4bac06be4e09f53d42151cd0ca 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-light.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=2132739bacef8e5933474b6cc1b49d37 2500w" />

      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=a5a8315daf7371774dd25c47688307d6" className="hidden dark:block" data-og-width="1330" width="1330" data-og-height="616" height="616" data-path="assets/guides/monetary-credits/free-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=303051c359de5678544da424894eac5f 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=f11d0c2112c78f09481d29fc8ae9795c 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=2cdc753e2c00790c1f8ed967f8c387c9 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=b594366595ebf489ccd01fee9218f7d6 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=5b97d4e19e7f1f1f9129b2d4bf9321f4 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/free-dark.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=f4c9c8d3c2af7c3a8febecd55cd22bac 2500w" />
    </Frame>

    <br />

    <Frame style={{ width: "400px" }}>
      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=4556f7bc7346b5cae19ae8df13d64d49" className="block dark:hidden" data-og-width="1298" width="1298" data-og-height="538" height="538" data-path="assets/guides/monetary-credits/pro-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=35b62628f73a08aa9326efa5db589707 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=7f6c74061094115009103acb82fd86ad 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=73962d325c7ff9ee9c251a10784c2128 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=524d080d5e1b015e3069e81fbbf920e6 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=68a158c399e81fde9389a71504411412 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-light.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=02cd364a23eba479d6fb3ef5bb21a2db 2500w" />

      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=1dfc33533ae4004af4b9cb9f9b92edb1" className="hidden dark:block" data-og-width="1288" width="1288" data-og-height="544" height="544" data-path="assets/guides/monetary-credits/pro-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=0f264534d6cd5848f388e9d7a4c2acb7 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=da4ff2b8578b5502857b48146d2a886c 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=be9b638af6c74425903a5c095b491f3b 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=ecb577f12b8c551f59c8682c1954b45c 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=21d4d80ad6d792bb95c7db6648ffa00f 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/pro-dark.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=87a11d00b2904704bee8507cf1f7acbf 2500w" />
    </Frame>

    Then, we'll create our top-up plan. We'll add a price to our credit feature, where each credit is worth $1. These top up credits will be \`one-off\` \`prepaid\` purchases that never expire.

    <Frame style={{ width: "500px" }}>
      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=61df798fdf6c03425d76512648d55eb6" className="block dark:hidden" data-og-width="1856" width="1856" data-og-height="1456" height="1456" data-path="assets/guides/monetary-credits/top-up-light.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=2e68a36a6eec0252f66fb393e70e367c 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=934128f84335bfa1a1a488449146f295 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=d203e7f707db801747ce71675df6efd1 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=531a33c5053ecfd7416fc49bbc729c07 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=3fa4284bbafd0897d81b5a2547801260 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-light.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=72a21aa0de16bd8b61a36f758c8777d7 2500w" />

      <img src="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=6d361d44926bd47e12fc2e660e62915c" className="hidden dark:block" data-og-width="1850" width="1850" data-og-height="1454" height="1454" data-path="assets/guides/monetary-credits/top-up-dark.png" data-optimize="true" data-opv="3" srcset="https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=280&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=f55c0d77beabf79bc439f64bbeb67d52 280w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=560&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=0cae9ec1a79907d87feaacd9939ade2b 560w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=840&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=e845d0b6ff78495872b85b29dc3e8111 840w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=1100&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=c897d83927839a33fe90f72904d798bc 1100w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=1650&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=7ec3cee7f4ee63e36c722984188e247f 1650w, https://mintcdn.com/autumn/1MuK4iLWEUU1zowQ/assets/guides/monetary-credits/top-up-dark.png?w=2500&fit=max&auto=format&n=1MuK4iLWEUU1zowQ&q=85&s=fd8f471a77e48da8158ae92f68cb3993 2500w" />
    </Frame>
  </Step>
</Steps>

## Implementation

<Steps>
  <Step>
    #### Create an Autumn Customer

    When your user signs up, create an Autumn customer. This will automatically assign them the Free plan, and grant them $5 credits per month.

    <CodeGroup>
      \`\`\`jsx React theme={null}
      import { useCustomer } from "autumn-js/react";

      const App = () => {
        const { customer } = useCustomer();

        console.log("Autumn customer:", customer);

        return <h1>Welcome, {customer?.name || "user"}!</h1>;
      };
      \`\`\`

      \`\`\`typescript Node.js theme={null}
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

      \`\`\`python Python theme={null}
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

      \`\`\`bash cURL theme={null}
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

    Every time our user sends a message to the chatbot, we'll first check if they have enough credits remaining to send the message.

    The \`required_balance\` parameter will convert the number of messages to credits. Eg, if you pass \`required_balance: 5\` for basic messages, then check will return \`allowed: true\` if the user has at least 0.05 USD credits remaining.

    <Note>
      Note how we're interacting with the underlying features (\`basic_messages\`,
      \`premium_messages\`) here--not the credit system.
    </Note>

    <CodeGroup>
      \`\`\`jsx React wrap theme={null}
      import { useCustomer } from "autumn-js/react";

      export function CheckBasicMessage() {
        const { check, refetch } = useCustomer();

        const handleCheckAccess = async () => {
          const { data } = await check({ featureId: "basic_messages", requiredBalance: 1 });

          if (!data?.allowed) {
            alert("You've run out of basic message credits");
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
        feature_id: "basic_messages",
        required_balance: 1,
      });

      if (!data.allowed) {
        console.log("User has run out of basic message credits");
        return;
      }
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          response = await autumn.check(
              customer_id="user_or_org_id_from_auth",
              feature_id="basic_messages",
              required_balance=1,
          )
          
          if not response.allowed:
              print("User has run out of basic message credits")
              return

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/check" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "feature_id": "basic_messages",
          "required_balance": 1
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="check response">
      The credit system ID will be returned in the \`balances\` field.

      \`\`\`json {8} theme={null}
      {
          "allowed": true,
          "code": "feature_found",
          "customer_id": "ayush",
          "feature_id": "usd_credits",
          "required_balance": 0.01,
          "interval": "month",
          "interval_count": 1,
          "unlimited": false,
          "balance": 5,
          "usage": 0,
          "included_usage": 5,
          "next_reset_at": 1769110978704,
          "overage_allowed": false,
          "credit_schema": [
              {
                  "feature_id": "basic_messages",
                  "credit_amount": 0.01
              },
              {
                  "feature_id": "premium_messages",
                  "credit_amount": 0.1
              }
          ]
      }
      \`\`\`
    </Expandable>
  </Step>

  <Step>
    #### Tracking messages and using credits

    Now let's implement our usage tracking and use up our credits. In this example, we're using 2 basic messages, which will cost us 0.02 USD credits.

    <CodeGroup>
      \`\`\`typescript Node.js theme={null}
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      await autumn.track({
        customer_id: "user_or_org_id_from_auth",
        feature_id: "basic_messages",
        value: 2,
      });
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          await autumn.track(
              customer_id="user_or_org_id_from_auth",
              feature_id="basic_messages",
              value=2,
          )

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/track" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "feature_id": "basic_messages",
          "value": 2
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="track response">
      \`\`\`json  theme={null}
      {
          "code": "event_received",
          "customer_id": "user_or_org_id_from_auth",
          "feature_id": "basic_messages"
      }
      \`\`\`
    </Expandable>
  </Step>

  <Step>
    #### Upgrading to Pro

    We can prompt the user to upgrade. When they click our "upgrade" button, we can use the \`checkout\` route to get a Stripe Checkout URL for them to make a payment.

    <CodeGroup>
      \`\`\`jsx React theme={null}
      import { useCustomer, CheckoutDialog } from "autumn-js/react";

      export default function UpgradeButton() {
        const { checkout } = useCustomer();

        return (
          <button
            onClick={async () => {
              await checkout({
                productId: "pro",
                dialog: CheckoutDialog,
              });
            }}
          >
            Upgrade to Pro
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
        product_id: "pro",
      });

      if (data.url) {
        // Redirect user to Stripe checkout URL
      } else {
        // Show upgrade preview to user
      }
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          response = await autumn.checkout(
              customer_id="user_or_org_id_from_auth",
              product_id="pro"
          )
          
          if response.url:
              # Redirect user to Stripe checkout URL
              pass
          else:
              # Show upgrade preview to user
              pass

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/checkout" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "product_id": "pro"
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="checkout response">
      \`\`\`json  theme={null}
      {
          "customer_id": "user_or_org_id_from_auth",
          "lines": [
              {
                  "description": "Pro - $10 / month",
                  "amount": 10,
                  "item": {
                      "type": "price",
                      "feature_id": null,
                      "feature": null,
                      "interval": "month",
                      "interval_count": 1,
                      "price": 10,
                      "display": {
                          "primary_text": "$10",
                          "secondary_text": "per month"
                      }
                  }
              }
          ],
          "product": {
              "id": "pro",
              "name": "Pro",
              "group": null,
              "env": "sandbox",
              "is_add_on": false,
              "is_default": false,
              "archived": false,
              "version": 1,
              "created_at": 1766428038264,
              "items": [
                  {
                      "type": "price",
                      "feature_id": null,
                      "feature": null,
                      "interval": "month",
                      "interval_count": 1,
                      "price": 10,
                      "display": {
                          "primary_text": "$10",
                          "secondary_text": "per month"
                      }
                  },
                  {
                      "type": "feature",
                      "feature_id": "usd_credits",
                      "feature_type": "single_use",
                      "feature": {
                          "id": "usd_credits",
                          "name": "USD credits",
                          "type": "credit_system",
                          "display": {
                              "singular": "USD credits",
                              "plural": "USD credits"
                          },
                          "credit_schema": [
                              {
                                  "metered_feature_id": "basic_messages",
                                  "credit_cost": 0.01
                              },
                              {
                                  "metered_feature_id": "premium_messages",
                                  "credit_cost": 0.1
                              }
                          ]
                      },
                      "included_usage": 10,
                      "interval": "month",
                      "interval_count": 1,
                      "reset_usage_when_enabled": true,
                      "entity_feature_id": null,
                      "display": {
                          "primary_text": "10 USD credits"
                      }
                  }
              ],
              "free_trial": null,
              "base_variant_id": null,
              "scenario": "upgrade",
              "properties": {
                  "is_free": false,
                  "is_one_off": false,
                  "interval_group": "month",
                  "has_trial": false,
                  "updateable": false
              }
          },
          "current_product": {
              "id": "free",
              "name": "Free",
              "group": null,
              "env": "sandbox",
              "is_add_on": false,
              "is_default": true,
              "archived": false,
              "version": 1,
              "created_at": 1766427877578,
              "items": [
                  {
                      "type": "feature",
                      "feature_id": "usd_credits",
                      "feature_type": "single_use",
                      "feature": {
                          "id": "usd_credits",
                          "name": "USD credits",
                          "type": "credit_system",
                          "display": {
                              "singular": "USD credits",
                              "plural": "USD credits"
                          },
                          "credit_schema": [
                              {
                                  "metered_feature_id": "basic_messages",
                                  "credit_cost": 0.01
                              },
                              {
                                  "metered_feature_id": "premium_messages",
                                  "credit_cost": 0.1
                              }
                          ]
                      },
                      "included_usage": 5,
                      "interval": "month",
                      "interval_count": 1,
                      "reset_usage_when_enabled": true,
                      "entity_feature_id": null,
                      "display": {
                          "primary_text": "5 USD credits",
                          "secondary_text": "per month"
                      }
                  }
              ],
              "free_trial": null,
              "base_variant_id": null,
              "scenario": "new",
              "properties": {
                  "is_free": true,
                  "is_one_off": false,
                  "has_trial": false,
                  "updateable": false
              }
          },
          "options": [],
          "total": 10,
          "currency": "usd",
          "url": "https://checkout.stripe.com/c/pay/.......",
          "has_prorations": false
      }
      \`\`\`
    </Expandable>
  </Step>

  <Step>
    #### Purchasing Top-ups

    When users run low on credits, they can purchase additional credits using our top-up plan. In this example, the user is purchasing 20 USD credits, which will cost them $20.

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
                  featureId: "usd_credits",
                  quantity: 20,
                }],
              });
            }}
          >
            Buy More Credits
          </button>
        );
      }
      \`\`\`

      \`\`\`typescript Node.js theme={null}
      import { Autumn } from "autumn-js";

      const autumn = new Autumn({
        secretKey: 'am_sk_42424242',
      });

      const { data } = await autumn.attach({
        customer_id: "user_or_org_id_from_auth",
        product_id: "top_up",
        options: [{
          feature_id: "usd_credits",
          quantity: 20,
        }],
      });
      \`\`\`

      \`\`\`python Python theme={null}
      import asyncio
      from autumn import Autumn

      autumn = Autumn("am_sk_42424242")

      async def main():
          response = await autumn.attach(
              customer_id="user_or_org_id_from_auth",
              product_id="top_up",
              options=[{
                "feature_id": "usd_credits",
                "quantity": 20,
              }],
          )

      asyncio.run(main())
      \`\`\`

      \`\`\`bash cURL theme={null}
      curl -X POST "https://api.useautumn.com/v1/attach" \
        -H "Authorization: Bearer am_sk_42424242" \
        -H "Content-Type: application/json" \
        -d '{
          "customer_id": "user_or_org_id_from_auth",
          "product_id": "top_up",
          "options": [{
            "feature_id": "usd_credits",
            "quantity": 20,
          }]
        }'
      \`\`\`
    </CodeGroup>

    <Expandable title="attach response">
      \`\`\`json  theme={null}
      {
          "success": true,
          "customer_id": "user_or_org_id_from_auth",
          "product_ids": [
              "top_up"
          ],
          "code": "one_off_product_attached",
          "message": "Successfully purchased product(s) Top up and attached to customer John"
      }
      \`\`\`
    </Expandable>
  </Step>
</Steps>


---

> To find navigation and other pages in this documentation, fetch the llms.txt file at: https://docs.useautumn.com/llms.txt
`;
