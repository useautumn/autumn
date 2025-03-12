import { CreateOrganization } from "@clerk/nextjs";

import React from "react";

function CreateOrgView() {
  return (
    <div className="flex flex-col items-center justify-center h-screen w-screen bg-zinc-100">
      <CreateOrganization
        routing="hash"
        skipInvitationScreen={true}
        afterCreateOrganizationUrl={"/onboarding"}
      />
    </div>
  );
}

export default CreateOrgView;
