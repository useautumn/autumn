import { useOrg } from "@/hooks/useOrg";
import {
  authClient,
  useListOrganizations,
  useSession,
} from "@/lib/auth-client";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

export const useCreateOrg = ({
  productMutate,
}: {
  productMutate: () => Promise<void>;
}) => {
  const axiosInstance = useAxiosInstance();
  const hasCreatedOrg = useRef(false);

  const { data: session } = useSession();
  const { data: organizations, isPending } = useListOrganizations();
  const { mutate } = useOrg();

  const getOrgSlug = () => {
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
    return `${slugify(session?.user!.name || "org")}_${randomDigits}`;
  };

  useEffect(() => {
    const createDefaultOrg = async () => {
      if (hasCreatedOrg.current || isPending || !session?.user) return;
      hasCreatedOrg.current = true;
      // Either set first org active, or create a new org
      try {
        if (organizations && organizations.length > 0) {
          await authClient.organization.setActive({
            organizationId: organizations[0]?.id,
          });
        } else {
          const { data, error } = await authClient.organization.create({
            name: `${session?.user.name}'s Org`,
            slug: getOrgSlug(),
          });

          if (error) throw error;

          await authClient.organization.setActive({
            organizationId: data?.id,
          });

          await mutate();
          await productMutate();
        }
      } catch (error: any) {
        toast.error(`Error initializing org: ${error.message}`);
      }
    };
    createDefaultOrg();

    // if (!org && setActive) {
    //   createDefaultOrg();
    // }
  }, [session, axiosInstance, productMutate]);
};
