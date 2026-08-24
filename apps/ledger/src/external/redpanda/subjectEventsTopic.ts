// Fixed at creation: partitions cap how many shard processes can ever own a
// disjoint slice of the keyspace, so the count matches SHARD_COUNT.
export const SUBJECT_EVENTS_TOPIC = "subject-events";
export const SUBJECT_EVENTS_PARTITIONS = 256;
