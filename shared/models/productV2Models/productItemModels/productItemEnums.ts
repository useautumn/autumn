export enum OnIncrease {
  BillImmediately = "bill_immediately",
  ProrateImmediately = "prorate_immediately",
  ProrateNextCycle = "prorate_next_cycle",
  BillNextCycle = "bill_next_cycle",
}

export enum OnDecrease {
  ProrateImmediately = "prorate_immediately",
  ProrateNextCycle = "prorate_next_cycle",
  None = "none",
}
