/**
 * Artillery processor for the Redis benchmark load test.
 *
 * Always targets the same large customer (the point is to stress Redis
 * with the worst-case key size). Randomises the entity to spread load
 * across different path index entries.
 */

const CUSTOMER_ID = "redis-bench-large-cus";
const ENTITY_COUNT = 100;
const CUS_ENTS_PER_PRODUCT = 10;

/**
 * Called before each virtual user scenario.
 * Sets customerId, featureId, and a random entityId.
 */
export function setContext(ctx, _events, done) {
  const entityIdx = Math.floor(Math.random() * ENTITY_COUNT);
  const featureIdx = Math.floor(Math.random() * CUS_ENTS_PER_PRODUCT);

  ctx.vars.customerId = CUSTOMER_ID;
  ctx.vars.featureId = `feature_${featureIdx}`;
  ctx.vars.entityId = `entity_${entityIdx}`;
  done();
}
