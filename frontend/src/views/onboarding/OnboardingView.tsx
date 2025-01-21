"use client";

import React, { useState } from "react";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { CustomToaster } from "@/components/general/CustomToaster";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { OrgService } from "@/services/OrgService";
import { toast } from "react-hot-toast";
import { getBackendErr } from "@/utils/genUtils";
import { AppEnv } from "@autumn/shared";
import {
  OrganizationList,
  OrganizationSwitcher,
  useOrganizationList,
} from "@clerk/nextjs";
import { useRouter } from "next/navigation";

function OnboardingView({ sessionClaims }: { sessionClaims: any }) {
  const { org_id, user } = sessionClaims || {};
  const axiosInstance = useAxiosInstance({ env: AppEnv.Live });
  const { createOrganization, setActive } = useOrganizationList();
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreateOrg = async () => {
    setLoading(true);
    try {
      if (!createOrganization) {
        toast.error("Error creating organization");
        return;
      }

      await createOrganization({ name: fields.name, slug: fields.slug });
      await setActive({ organization: fields.slug });
      router.refresh();
    } catch (error: any) {
      if (error.message) {
        toast.error(error.message);
      } else {
        toast.error("Error creating organization");
      }
    }
    setLoading(false);
  };

  const [slugEditted, setSlugEditted] = useState(false);
  const [fields, setFields] = useState({
    name: "",
    slug: "",
  });

  if (!org_id && Object.keys(user.organizations).length == 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-stone-50">
        <CustomToaster />
        <div className="w-[430px] shadow-lg rounded-2xl border flex flex-col p-8 bg-white gap-4">
          <p className="text-lg font-bold text-t2">Create an organization</p>
          <div>
            <FieldLabel>Name</FieldLabel>
            <Input
              placeholder="Organization Name"
              value={fields.name}
              onChange={(e) => {
                const newFields = { ...fields, name: e.target.value };
                if (!slugEditted) {
                  newFields.slug = slugify(e.target.value);
                }
                setFields(newFields);
              }}
            />
          </div>
          <div>
            <FieldLabel>Slug</FieldLabel>
            <Input
              placeholder="Organization Slug"
              value={fields.slug}
              onChange={(e) => {
                setSlugEditted(true);
                setFields({ ...fields, slug: e.target.value });
              }}
            />
          </div>
          <div className="flex justify-end mt-4">
            <Button
              className="w-fit"
              onClick={handleCreateOrg}
              isLoading={loading}
              variant="gradientPrimary"
            >
              Create Organization
            </Button>
          </div>
        </div>
        {/* <CreateOrganization
          skipInvitationScreen={true}
          // afterCreateOrganizationUrl={"/sandbox/customers"}
        /> */}
      </div>
    );
  } else if (Object.keys(user.organizations).length > 0) {
    return <OrganizationList hidePersonal={true} />;
  }
}

export default OnboardingView;
