import Step from "@/components/general/OnboardingStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { Building } from "lucide-react";
import { useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { toast } from "sonner";

export const CreateOrgStep = ({
  pollForOrg,
}: {
  pollForOrg: () => Promise<void>;
}) => {
  const { organization: org } = useOrganization();
  const { createOrganization, setActive } = useOrganizationList();

  const [isExploding, setIsExploding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState({
    name: org?.name || "",
    slug: "",
  });

  const handleCreateOrg = async () => {
    setLoading(true);

    try {
      if (!createOrganization) {
        toast.error("Error creating organization");
        return;
      }

      const org = await createOrganization({
        name: fields.name,
      });

      await setActive({ organization: org.id });
      await pollForOrg();
      toast.success(`Created your organization: ${org.name}`);
      setIsExploding(true);
    } catch (error: any) {
      if (error.message) {
        toast.error(error.message);
      } else {
        toast.error("Error creating organization");
      }
    }
    setLoading(false);
  };

  return (
    <Step title="Create your organization">
      <div className="flex gap-8 w-full justify-between flex-col lg:flex-row">
        <div className="text-t2 flex flex-col gap-2 w-full lg:w-1/3">
          <p className="flex items-center">
            <span>👋</span>
            <span className="font-bold bg-gradient-to-r from-orange-500 via-pink-500 to-primary w-fit bg-clip-text text-transparent">
              &nbsp; Welcome to Autumn
            </span>
          </p>
          <p>
            Create an organization to get started and integrate pricing within 5
            minutes.
          </p>
        </div>
        <div className="w-full lg:w-2/3 min-w-md max-w-lg flex gap-2 rounded-sm">
          <Input
            placeholder="Org name"
            value={org?.name || fields.name}
            disabled={!!org?.name}
            onChange={(e) => {
              const newFields = { ...fields, name: e.target.value };
              setFields(newFields);
            }}
          />
          <Button
            className="w-fit"
            disabled={!!org?.name}
            onClick={handleCreateOrg}
            isLoading={loading}
            variant="gradientPrimary"
            startIcon={<Building size={12} />}
          >
            Create Organization
          </Button>

          {isExploding && (
            <ConfettiExplosion
              force={0.8}
              duration={3000}
              particleCount={250}
              zIndex={1000}
              width={1600}
              onComplete={() => {
                console.log("complete");
              }}
            />
          )}
        </div>
      </div>
    </Step>
  );
};
