import { getOrgFromSession } from "@/utils/serverUtils";
import ConnectStripe from "@/views/onboarding/ConnectStripe";

import { useSearchParams } from "next/navigation";

export default async function StripePage() {
  return <ConnectStripe />;
}
