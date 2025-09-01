import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrg } from "@/hooks/common/useOrg";
import { authClient } from "@/lib/auth-client";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import OrgLogoUploader from "@/views/main-sidebar/org-dropdown/manage-org/OrgLogoUploader";
import { Separator } from "@/components/ui/separator";
import { DeleteOrgPopover } from "../org-dropdown/manage-org/DeleteOrgPopover";

export const OrgDetails = () => {
  const { org, mutate } = useOrg();

  const [inputs, setInputs] = useState({
    name: org?.name,
    slug: org?.slug,
  });

  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => {
    return inputs.name !== org?.name || inputs.slug !== org?.slug;
  }, [inputs, org]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { data, error } = await authClient.organization.update({
        data: {
          name: inputs.name,
          slug: inputs.slug,
        },
        organizationId: org.id,
      });

      if (error) {
        toast.error(error.message || "Failed to update organization");
        return;
      }

      await mutate();

      toast.success("Successfully updated organization");
    } catch (error) {
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-4 w-full h-full flex flex-col gap-4">
      <div className="flex flex-col gap-4">
        <div className="w-full flex justify-between items-center">
          <OrgLogoUploader />
        </div>
        <div className="w-full flex gap-4">
          <OrgDetailInput
            label="Name"
            value={inputs.name}
            setValue={(value) => setInputs({ ...inputs, name: value })}
          />
          <OrgDetailInput
            label="Slug"
            value={inputs.slug}
            setValue={(value) => setInputs({ ...inputs, slug: value })}
          />
          <div>
            <FieldLabel>&nbsp;</FieldLabel>
            <Button
              variant="outline"
              disabled={!canSave}
              onClick={handleSave}
              shimmer={saving}
              className="min-w-16"
            >
              Save
            </Button>
          </div>
        </div>
      </div>
      <Separator className="my-2" />
      <DeleteOrgPopover />
    </div>
  );
};

const OrgDetailInput = ({
  label,
  value,
  setValue,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
}) => {
  return (
    <div className="flex flex-col">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
    </div>
  );
};
