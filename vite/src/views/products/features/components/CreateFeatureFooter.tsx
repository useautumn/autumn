import { CustomDialogFooter } from "@/components/general/modal-components/DialogContentWrapper";
import { Button } from "@/components/ui/button";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";

export const CreateFeatureFooter = ({
  handleBack,
  handleCreate,
}: {
  handleBack?: () => void;
  handleCreate: () => Promise<void>;
}) => {
  const [loading, setLoading] = useState(false);
  return (
    <CustomDialogFooter className="justify-between">
      {handleBack ? (
        <Button
          variant="dialogBack"
          onClick={handleBack}
          startIcon={<ArrowLeft size={10} />}
        >
          Back
        </Button>
      ) : (
        <div></div>
      )}
      <Button
        variant="add"
        onClick={async () => {
          setLoading(true);
          await handleCreate();
          setLoading(false);
        }}
        isLoading={loading}
      >
        Create
      </Button>
    </CustomDialogFooter>
  );
};
