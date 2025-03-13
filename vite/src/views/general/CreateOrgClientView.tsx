"use client";

import { CreateOrganization } from "@clerk/nextjs";

export default function CreateOrgClientView() {
  return <CreateOrganization routing="hash" skipInvitationScreen={true} />;
}
