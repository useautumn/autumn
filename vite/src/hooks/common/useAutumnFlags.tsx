import { useEffect } from "react";
import { notNullish } from "@/utils/genUtils";
import { useCustomer } from "autumn-js/react";
import { useLocalStorage } from "@/hooks/common/useLocalStorage";

export const useAutumnFlags = () => {
  const { customer } = useCustomer();

  const [flags, setFlags] = useLocalStorage("autumn.flags", {
    pkey: false,
    webhooks: false,
  });

  useEffect(() => {
    if (!customer?.features) return;

    const nextFlags = {
      pkey: notNullish(customer.features.pkey),
      webhooks: notNullish(customer.features.webhooks),
    };

    // Only update storage/state when values actually change
    if (
      flags.pkey !== nextFlags.pkey ||
      flags.webhooks !== nextFlags.webhooks
    ) {
      setFlags(nextFlags);
    }
  }, [customer?.features?.pkey, customer?.features?.webhooks]);

  return flags;
};
