import Step from "@/components/general/OnboardingStep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useOrganization, useOrganizationList } from "@clerk/clerk-react";
import { Building } from "lucide-react";
import { useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { toast } from "sonner";

export const CreateOrgStep = ({
  number,
  pollForOrg,
}: {
  number: number;
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
    <Step
      title="Create your organization"
      number={number}
      description={
        <>
          <div className="flex relative w-fit">
            <div className="flex bg-purple-100 shadow-sm shadow-purple-500/50 w-fit px-3 py-0.5 rounded-lg  absolute w-full h-full z-0"></div>
            <p className="flex items-center border border-primary w-fit px-3 py-0.5 rounded-lg z-10">
              <span className="animate-bounce">👋</span>
              <span className="font-bold text-primary">
                &nbsp; Welcome to Autumn
              </span>
            </p>
          </div>
          <p>
            Create an organization to get started and integrate pricing within 5
            minutes.
          </p>
        </>
      }
    >
      {/* <div className="flex gap-8 w-full justify-between flex-col lg:flex-row"> */}
      <div className="w-full min-w-md max-w-2xl flex gap-2 rounded-sm">
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
          className="min-w-40 w-40 max-w-40"
          disabled={!!org?.name}
          onClick={handleCreateOrg}
          isLoading={loading}
          variant="gradientPrimary"
          // startIcon={<Building size={12} />}
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
      {/* </div> */}
    </Step>
  );
};
