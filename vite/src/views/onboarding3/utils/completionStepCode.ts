export const getCodeSnippets = (
	featureId?: string,
	productId?: string,
	featureName?: string,
) => {
	const actualFeatureId = featureId || "your_feature_id";
	const actualProductId = productId || "your_product_id";
	const actualFeatureName = featureName || "Your Feature";

	return {
		allowed: {
			react: `import { useCustomer } from 'autumn-js/react';

const { check } = useCustomer();

const handleCheckFeature = async () => {
  const { data } = await check({
    featureId: '${actualFeatureId}',
    requiredQuantity: 1
  });
  if (!data?.allowed) {
    alert('Feature not allowed');
  }
}`,
			nodejs: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY
});

const { data, error } = await autumn.check({
  customerId: 'cust_123',
  featureId: '${actualFeatureId}'
});`,
			response: `{
  "allowed": true,
  "feature": {
    "id": "${actualFeatureId}",
    "name": "${actualFeatureName}",
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
          productId: "${actualProductId}",
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
  productId: '${actualProductId}',
  successUrl: 'https://example.com/success',
  cancelUrl: 'https://example.com/cancel'
});

console.log(session.checkout_url);`,
			response: `{
  "url": "https://checkout.stripe.com/c/pay/cs_test_123",
  "customer_id": "cust_123",
  "product": {
    "id": "${actualProductId}",
    "name": "Your Plan",
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
    featureId: '${actualFeatureId}',
    value: 1,
  });
}`,
			nodejs: `import { Autumn } from 'autumn-js';

const autumn = new Autumn({
  apiKey: process.env.AUTUMN_API_KEY
});

// 1. Check if user has access first
const checkResult = await autumn.check({
  customerId: 'user-123',
  featureId: '${actualFeatureId}',
  requiredQuantity: 1
});

if (!checkResult.data?.allowed) {
  throw new Error("User has reached their limit");
}

// 2. Track usage after successful check
await autumn.track({
  customerId: 'user-123',
  featureId: '${actualFeatureId}',
  value: 1,
});`,
			response: `{
  "id": "evt_2w5dzidzFD1cESxOGnn9frVuVcm",
  "code": "event_received",
  "customer_id": "user_123",
  "feature_id": "${actualFeatureId}"
}`,
		},
	};
};

// Backward compatibility - use default snippets
export const codeSnippets = getCodeSnippets();
export const reactCode = codeSnippets.allowed.react;
export const nodejsCode = codeSnippets.allowed.nodejs;
export const responseCode = codeSnippets.allowed.response;
