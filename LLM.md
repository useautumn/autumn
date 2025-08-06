# Autumn - Open Source Billing Infrastructure

![Autumn](https://github.com/useautumn/autumn/raw/main/assets/github_hero.png)

**Autumn** is an open-source layer between Stripe and your application that allows you to create any pricing model and embed it with a couple lines of code. Build subscriptions, credit systems, usage-based models, and custom plans without handling webhooks, upgrades/downgrades, cancellations, or payment failures.

## Installation

```bash
npm install autumn-js
# or
pnpm add autumn-js
```

## Core Concepts

Autumn provides three main functions for all billing operations:

1. **`attach`** - Handle all purchase flows (upgrades, downgrades, new purchases)
2. **`check`** - Verify customer access to products/features and remaining usage
3. **`track`** - Record usage events for metered features

## API Reference

### Server-Side API

#### Authentication

```typescript
// Headers for API requests
const headers = {
  'Authorization': 'Bearer am_sk_...', // Secret key for server-side
  'Content-Type': 'application/json',
  'x-api-version': '1.1' // Optional API version
};
```

#### 1. Attach API - `/v1/attach`

**Purpose**: Handle all purchase flows, upgrades, downgrades, and product attachments

```typescript
// POST /v1/attach
interface AttachRequest {
  customer_id: string;
  customer_data?: any; // For auto-creating customers
  
  // Entity Info (for multi-tenant)
  entity_id?: string;
  entity_data?: any;
  
  // Product Selection
  product_id?: string;
  product_ids?: string[];
  
  // Feature Options
  options?: {
    feature_id: string;
    quantity: number;
    upcoming_quantity?: number;
    adjustable_quantity?: boolean;
  }[];
  
  // Custom Product Configuration
  is_custom?: boolean;
  items?: ProductItem[];
  free_trial?: boolean;
  
  // Checkout Configuration
  success_url?: string;
  force_checkout?: boolean;
  invoice_only?: boolean;
  metadata?: any;
  billing_cycle_anchor?: number;
  reward?: string;
}

// Example Usage
const response = await fetch('/v1/attach', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    customer_id: 'user_123',
    product_id: 'pro_plan',
    options: [{
      feature_id: 'api_calls',
      quantity: 1000
    }]
  })
});
```

#### 2. Check API - `/v1/check`

**Purpose**: Check customer access to products, features, or remaining usage

```typescript
// POST /v1/check
interface CheckRequest {
  customer_id: string;
  feature_id?: string;
  product_id?: string;
  required_quantity?: number;
  required_balance?: number;
  customer_data?: any;
  entity_id?: string;
  with_preview?: boolean;
}

interface CheckResponse {
  allowed: boolean;
  balance?: number;
  feature_id: string;
  preview?: CheckPreview;
}

// Example Usage
const response = await fetch('/v1/check', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    customer_id: 'user_123',
    feature_id: 'ai_tokens',
    required_balance: 100
  })
});

const { allowed, balance } = await response.json();
if (!allowed) {
  console.log('Insufficient balance:', balance);
}
```

#### 3. Track API - `/v1/track`

**Purpose**: Record usage events for metered features

```typescript
// POST /v1/track
interface TrackRequest {
  customer_id: string;
  event_name?: string;
  feature_id?: string;
  properties?: Record<string, any>;
  timestamp?: number;
  idempotency_key?: string;
  value?: number;
  set_usage?: boolean;
  entity_id?: string;
  customer_data?: any;
}

interface TrackResponse {
  id: string;
  code: "event_received";
  customer_id: string;
  entity_id?: string;
  feature_id?: string;
  event_name?: string;
}

// Example Usage
const response = await fetch('/v1/track', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    customer_id: 'user_123',
    feature_id: 'ai_tokens',
    value: 50,
    properties: {
      model: 'gpt-4',
      tokens_used: 50
    }
  })
});
```

### React Integration

#### Setup Provider

```tsx
import { AutumnProvider } from "autumn-js/next";
// or
import { AutumnProvider } from "autumn-js/react";

function App() {
  return (
    <AutumnProvider
      customerId="user_123"
      customerData={{
        name: "John Doe",
        email: "john@example.com"
      }}
    >
      <YourApp />
    </AutumnProvider>
  );
}
```

#### useAutumn Hook

```tsx
import { useAutumn } from "autumn-js/next";
// or
import { useAutumn } from "autumn-js/react";

function MyComponent() {
  const { 
    customer,           // Customer data with products, features, balances
    attach,            // Function to attach/upgrade products
    entitled,          // Check feature entitlements
    sendEvent,         // Track usage events
    refetch,           // Refresh customer data
    openBillingPortal  // Open Stripe billing portal
  } = useAutumn();

  // Check feature access
  const handleFeatureUse = async () => {
    const { allowed } = await entitled({ featureId: "chat-messages" });
    
    if (!allowed) {
      alert("Feature not available!");
      return;
    }
    
    // Use the feature
    await sendEvent({ featureId: "chat-messages" });
    await refetch(); // Update customer data
  };

  // Upgrade flow
  const handleUpgrade = async () => {
    await attach({ productId: "pro-plan" });
  };

  // Billing management
  const handleBilling = async () => {
    await openBillingPortal();
  };

  return (
    <div>
      <h1>Welcome {customer?.name}</h1>
      <button onClick={handleFeatureUse}>Use Feature</button>
      <button onClick={handleUpgrade}>Upgrade to Pro</button>
      <button onClick={handleBilling}>Manage Billing</button>
    </div>
  );
}
```

#### Pricing Table Component

```tsx
import { PricingTable } from "autumn-js/react";

function PricingPage() {
  return (
    <div>
      <h1>Choose Your Plan</h1>
      <PricingTable 
        productDetails={{
          // Optional: customize product display
        }}
      />
    </div>
  );
}
```

## Key Types and Enums

### Feature Types

```typescript
enum FeatureType {
  Boolean = "boolean",      // On/off features
  Metered = "metered",      // Usage-based features
  CreditSystem = "credit_system" // Credit-based features
}
```

### Usage Models

```typescript
enum UsageModel {
  Prepaid = "prepaid",        // Pay upfront, use over time
  PayPerUse = "pay_per_use"   // Pay as you use
}
```

### Product Item Configuration

```typescript
interface ProductItem {
  feature_id?: string;
  feature_type?: FeatureType;
  included_usage?: number | "inf";
  interval?: "month" | "year" | "one_time";
  usage_model?: UsageModel;
  price?: number;
  tiers?: {
    up_to: number | "inf";
    price: number;
  }[];
  billing_units?: number;
  usage_limit?: number;
  reset_usage_when_enabled?: boolean;
}
```

## Error Handling

All API endpoints return standardized error responses:

```typescript
interface ErrorResponse {
  message: string;
  code: string; // Error code from ErrCode enum
}

// Common error codes:
// - "invalid_secret_key"
// - "customer_not_found"
// - "feature_not_found"
// - "insufficient_balance"
// - "invalid_request"
```

## Additional Endpoints

### Customer Management

```typescript
// Get customer details
GET /v1/customers/:customer_id

// Update customer
POST /v1/customers/:customer_id
{
  name?: string;
  email?: string;
  metadata?: any;
}

// Delete customer
DELETE /v1/customers/:customer_id

// Search customers
POST /v1/customers/all/search
{
  query?: string;
  limit?: number;
  offset?: number;
}

// Get billing portal
GET /v1/customers/:customer_id/billing_portal
```

### Setup Payment Method

```typescript
// Setup payment method for customer
POST /v1/setup_payment
{
  customer_id: string;
  success_url?: string;
  cancel_url?: string;
}
```

## Import Paths

```typescript
// React/Next.js integration
import { useAutumn, AutumnProvider } from "autumn-js/next";
import { useAutumn, AutumnProvider, PricingTable } from "autumn-js/react";

// Express.js middleware
import { autumnHandler } from "autumn-js/express";

// Core client
import { Autumn } from "autumn-js";

// Types (from shared package)
import { 
  FeatureType, 
  UsageModel, 
  ProductItem,
  AttachRequest,
  CheckRequest,
  TrackRequest 
} from "@autumn/shared";
```

## Complete Example

```tsx
import { useAutumn } from "autumn-js/next";
import { toast } from "sonner";

function ChatApp() {
  const { customer, entitled, sendEvent, attach, refetch } = useAutumn();

  const sendMessage = async () => {
    // Check if user has message credits
    const { allowed, balance } = await entitled({
      featureId: "chat-messages"
    });

    if (!allowed) {
      toast.error(`No messages remaining! Balance: ${balance}`);
      
      // Offer upgrade
      const upgrade = confirm("Upgrade to Pro for unlimited messages?");
      if (upgrade) {
        await attach({ productId: "pro-plan" });
      }
      return;
    }

    // Send the message (your app logic)
    console.log("Sending message...");

    // Track usage
    await sendEvent({
      featureId: "chat-messages",
      properties: {
        message_length: 100,
        timestamp: Date.now()
      }
    });

    // Refresh customer data to update balance
    await refetch();
    
    toast.success("Message sent!");
  };

  return (
    <div>
      <h1>Chat App</h1>
      <p>Welcome {customer?.name}!</p>
      <p>Messages remaining: {customer?.features?.['chat-messages']?.balance || 0}</p>
      
      <button onClick={sendMessage}>
        Send Message
      </button>
      
      <button onClick={() => attach({ productId: "pro-plan" })}>
        Upgrade to Pro
      </button>
    </div>
  );
}
```

## Self-Hosting

To self-host Autumn:

```bash
# Clone the repository
git clone https://github.com/useautumn/autumn.git
cd autumn

# Install dependencies
pnpm install

# Run setup script
pnpm run setup

# Start with Docker
docker compose -f docker-compose.prod.yml up
```

The dashboard will be available at `http://localhost:3000`.

## Resources

- **Documentation**: https://docs.useautumn.com
- **GitHub**: https://github.com/useautumn/autumn
- **Discord**: https://discord.gg/53emPtY9tA
- **Cloud Service**: https://app.useautumn.com

---

*This documentation covers the core Autumn API for integrating billing and subscription management into your applications. For advanced features and detailed configuration options, refer to the official documentation.*
