import { useOrganization } from "@clerk/clerk-react";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useOrganizationList } from "@clerk/clerk-react";
import { useEffect, useRef } from "react";

export const useCreateOrg = ({
  productMutate,
}: {
  productMutate: () => Promise<void>;
}) => {
  const axiosInstance = useAxiosInstance();
  const { organization: org } = useOrganization();
  const { setActive } = useOrganizationList();
  const hasCreatedOrg = useRef(false);

  useEffect(() => {
    const createDefaultOrg = async () => {
      if (hasCreatedOrg.current) return;

      hasCreatedOrg.current = true;
      const { data } = await axiosInstance.post("/organization");
      await setActive?.({ organization: data.id });
      await productMutate();
    };

    if (!org) {
      createDefaultOrg();
    }
  }, [org]);
};
