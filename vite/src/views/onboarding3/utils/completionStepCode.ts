export const codeSnippets = {
	allowed: {
		react: `import { useCustomer } from 'autumn-js/react';

const { allowed } = useCustomer();

const handleCheckFeature = async () => {
  if ( !allowed({ featureId: 'milk_gallons' }) ) {
    alert('Feature not allowed');
  }
}`,
		nodejs: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY
});

const allowed = await autumn.check({
  customerId: 'cust_123',
  featureId: 'milk_gallons'
});`,
		response: `{
  "allowed": true,
  "feature": {
    "id": "milk_gallons",
    "name": "Milk Gallons",
    "type": "limit"
  }
}`,
	},
	checkout: {
		react: `import { 
  useCustomer, 
  CheckoutDialog 
} from "autumn-js/react";

export default function PurchaseButton() {
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
}`,
		nodejs: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY
});

const session = await autumn.checkout({
  customerId: 'cust_123',
  productId: 'pro',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel'
});

console.log(session.checkout_url);`,
		response: `{
  "url": "https://checkout.stripe.com/c/pay/cs_test_123",
  "customer_id": "cust_123",
  "product": {
    "id": "pro",
    "name": "Pro",
    "items": [
      {
        "type": "price",
        "interval": "month",
        "price": 20
      }
    ]
  }
}`,
	},
	track: {
		react: `import { useCustomer } from 'autumn-js/react';

const { track } = useCustomer();

const handleAction = async () => {
  await track({
    featureId: 'ai-messages',
    value: 1,
  });
}`,
		nodejs: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY
});

await autumn.track({
  customerId: 'user-123',
  featureId: 'ai-messages',
  value: 1,
});`,
		response: `{
  "id": "evt_2w5dzidzFD1cESxOGnn9frVuVcm",
  "code": "event_received",
  "customer_id": "user_123",
  "feature_id": "messages"
}`,
	},
};

// Backward compatibility exports
export const reactCode = codeSnippets.allowed.react;
export const nodejsCode = codeSnippets.allowed.nodejs;
export const responseCode = codeSnippets.allowed.response;
