import { useOrganization, useUser } from "@clerk/clerk-react";

import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useOrganizationList } from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";

export const useCreateOrg = ({
  productMutate,
}: {
  productMutate: () => Promise<void>;
}) => {
  const axiosInstance = useAxiosInstance();
  const { user } = useUser();
  const { organization: org } = useOrganization();
  const { setActive } = useOrganizationList();
  const hasCreatedOrg = useRef(false);

  useEffect(() => {
    const createDefaultOrg = async () => {
      if (hasCreatedOrg.current) return;

      hasCreatedOrg.current = true;

      // Either set first org active, or create a new org
      try {
        if (
          user?.organizationMemberships?.length &&
          user.organizationMemberships.length > 0
        ) {
          await setActive?.({
            organization: user.organizationMemberships[0].organization.id,
          });
          await productMutate();

          return;
        } else {
          const { data } = await axiosInstance.post("/organization");

          const res = await setActive?.({ organization: data.id });

          await productMutate();
        }
      } catch (error) {
        console.error("Error creating organization:", error);
      }
    };

    if (!org && setActive) {
      createDefaultOrg();
    }
  }, [org, axiosInstance, setActive, productMutate, user]);
};
