import { OnDecrease, OnIncrease } from "@autumn/shared";

export const shouldCreateInvoiceItem = (onIncrease: OnIncrease) => {
  return (
    onIncrease === OnIncrease.BillImmediately ||
    onIncrease === OnIncrease.ProrateImmediately ||
    onIncrease === OnIncrease.ProrateNextCycle
  );
};

export const shouldBillNow = (onIncrease: OnIncrease) => {
  return (
    onIncrease === OnIncrease.BillImmediately ||
    onIncrease === OnIncrease.ProrateImmediately
  );
};

export const shouldProrate = (onIncrease?: OnIncrease | OnDecrease) => {
  if (!onIncrease) {
    return true;
  }

  return (
    onIncrease === OnIncrease.ProrateNextCycle ||
    onIncrease === OnIncrease.ProrateImmediately ||
    onIncrease === OnDecrease.Prorate
  );
};
