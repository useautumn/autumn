import { useOrganization, useSession } from "@clerk/clerk-react";
import { useEffect } from "react";

export const useSessionClaims = () => {
  const { isLoaded, session } = useSession();
  const { isLoaded: isOrgLoaded, organization } = useOrganization();
  useEffect(() => {}, [isOrgLoaded, isLoaded]);

  if (!isLoaded) {
    return { isLoaded: false, claims: null };
  }

  return { isLoaded: true, claims: session?.lastActiveToken?.jwt?.claims };
};
