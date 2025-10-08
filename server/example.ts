// const childProduct = {
//   product_id: "user_seat",
//   entity: {
//     type: "user",
//     enable_on_creation: true,
//   },

//   price: {
//     tiers: [
//       {
//         amount: 500,
//         to: 3,
//       },
//       {
//         amount: 400,
//         to: -1,
//       }
//     ]
//   }
// }


// // Relationship between parent product / child product (?)

// const product = {
//   id: "pro_plan",
//   name: "Pro Plan",
//   group: null,
//   version: 1,
//   add_on: false, // combine add on / default?
//   default: false,
//   price: {
//     amount: 20,
//     interval: "month",
//   },
//   features: [],
//   entity_products: []
// }

// // Product Feature
// const productFeature = {
//   feature_id: "messages",
//   reset_interval: "month",
//   included: 500,

//   price: {
//     tiers: [
//       {
//         amount: 1,
//         to: 1000,
//       },
//       {
//         amount: 0.5,
//         to: -1,
//       }
//     ],
//     interval: "month",
//     billing_units: 10,
//     usage_model: "usage",
//     proration: {
//       on_increase: "",
//       on_decrease: "prorate_immediately",
//     }
//   },

//   reset_usage_when_enabled: true,
//   rollover: {
//     max: 500,
//     duration: "month",
//     duration_count: 1, // only if duration is month
//   }
// }


// // To think about: prepaid vs pay-per-use?

// // Entity Products
// const entityProduct = { 
//   product_id: "user_seat",
//   price: {
//     amount: 14,
//     interval: "month",
//   },
// }


// // Checkout / Buy (prepay for entity products)
// // @ts-ignore
// await autumn.checkout({
//   product_id: "pro_plan",
//   customer_id: "cus_123",
//   quantities: [
//     {
//       entity_product_id: "user_seat",
//       quantity: 4,
//     }
//   ]
// })

// // Sweep Flow

// // Create entity
// // @ts-ignore
// await autumn.entities.create({
//   id: "entity_123",
//   name: "Entity 123",
// })
// // @ts-ignore
// await autumn.attach({
//   id: "entity_123",
//   product_id: "user_seat",
//   quantity: 4,
// })


// // Checkout / Buy (prepay for features)
// // @ts-ignore
// await autumn.checkout({
//   product_id: "pro_plan",
//   customer_id: "cus_123",
//   quantities: [
//     {
//       feature_id: "messages",
//       quantity: 3500,
//     }
//   ]
// })