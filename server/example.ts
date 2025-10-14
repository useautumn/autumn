// @ts-nocheck

import { customers, } from "@autumn/shared";

const entitiesCTE = cte({
  name: 'entities',
  from: entities,
  where: eq(entities.internal_customer_id, customer.internal_id),
  limit: 100,
})

const cusProductsCTE = cte({
  name: 'customer_products',
  from: customer_products,
  with: {
    product: cte({
      from: products,
      where: eq(products.internal_id, customer_products.internal_product_id),
    }),
    customer_prices: cte({
      from: customer_prices,
      where: eq(customer_prices.customer_product_id, customer_products.id),
      with: {
        price: join({
          from: prices,
          where: eq(prices.id, customer_prices.price_id),
        })
      }
    }),
    free_trial: cte({
      from: free_trials,
      where: eq(free_trials.id, customer_products.free_trial_id),
    })
  },
  // where: eq(customer_products.internal_customer_id, customer.internal_id),
  limit: 100,
})

const fullCustomerCTE = cte({
  name: 'full_customer',
  from: customers, // drizzle table
  with: {
    entities: entitiesCTE(),
    customer_products: cusProductsCTE(),
    organization: organizationsCTE(), // this is not an array, but buildCTE should be dynamic enough to handle this?
  }
});
await fullCustomerCTE.execute();

const childProduct = {
  product_id: "user_seat",
  entity: {
    type: "user",
    enable_on_creation: true,
  },

  price: {
    tiers: [
      {
        amount: 500,
        to: 3,
      },
      {
        amount: 400,
        to: -1,
      }
    ]
  }
}


// Relationship between parent product / child product (?)

const product = {
  id: "pro_plan",
  name: "Pro Plan",
  group: null,
  version: 1,
  add_on: false, // combine add on / default?
  default: false,
  price: {
    amount: 20,
    interval: "month",
  },
  features: [],
  entity_products: []
}

// Product Feature
const productFeature = {
  feature_id: "messages",
  reset_interval: "month",
  included: 500,

  price: {
    tiers: [
      {
        amount: 1,
        to: 1000,
      },
      {
        amount: 0.5,
        to: -1,
      }
    ],
    interval: "month",
    billing_units: 10,
    usage_model: "usage",
    proration: {
      on_increase: "",
      on_decrease: "prorate_immediately",
    }
  },

  reset_usage_when_enabled: true,
  rollover: {
    max: 500,
    duration: "month",
    duration_count: 1, // only if duration is month
  }
}


// To think about: prepaid vs pay-per-use?

// Entity Products
const entityProduct = { 
  product_id: "user_seat",
  price: {
    amount: 14,
    interval: "month",
  },
}


// Checkout / Buy (prepay for entity products)
// @ts-ignore
await autumn.checkout({
  product_id: "pro_plan",
  customer_id: "cus_123",
  quantities: [
    {
      entity_product_id: "user_seat",
      quantity: 4,
    }
  ]
})

// Sweep Flow

// Create entity
// @ts-ignore
await autumn.entities.create({
  id: "entity_123",
  name: "Entity 123",
})
// @ts-ignore
await autumn.attach({
  id: "entity_123",
  product_id: "user_seat",
  quantity: 4,
})


// Checkout / Buy (prepay for features)
// @ts-ignore
await autumn.checkout({
  product_id: "pro_plan",
  customer_id: "cus_123",
  quantities: [
    {
      feature_id: "messages",
      quantity: 3500,
    }
  ]
})


// Customer
const customer = {
  id: "cus_123",
  name: "Apple Inc.",
  products: [
    {
      product_id: "team_plan",
      status: "active",
      current_period_start: 1717852800,
      current_period_end: 1720531200,
      feature_quantities: [
        {
          feature_id: "messages",
          quantity: 3500,
        }
      ],
      product_quantities: [
        {
          entity_product_id: "user_seat",
          quantity: 4,
          used: 2,
        },
        {
          entity_product_id: "dev_seat",
          quantity: 8,
          used: 2,
        }
      ]
    }
  ],
  features: {
    messages: {
      feature_id: "messages",
      starting_balance: 3500,
      balance: 2500,
      used: 1000,
      limit: 1000,

      next_reset_at: 1720531200,
      interval: "month",
      interval_count: 1,
    },
  }
}

// Full customer feature response
const customerFeature = {
  feature_id: "messages",
  starting_balance: 3500,
  balance: 2500,
  used: 1000,
  limit: 1000, // or null

  next_reset_at: 1720531200,
  interval: "month",
  interval_count: 1,


  // expand parameter
  breakdown: [
    {
      interval: "month",
      interval_count: 1,
      starting_balance: 400,
      balance: 350,
      used: 50,
      limit: 400,
      next_reset_at: 1720531200,
    }
  ],

  // expand parameter
  rollovers: [
    {
      balance: 50,
      expires_at: 1720531200,
    }
  ]
}