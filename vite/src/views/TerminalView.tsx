import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customers } from "@autumn/shared";
import { useCustomer } from "autumn-js/react";
import { Terminal } from "lucide-react";
import { Link } from "react-router";
import ErrorScreen from "./general/ErrorScreen";
import LoadingScreen from "./general/LoadingScreen";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";

export const TerminalView = () => {
  const { customer, isLoading } = useCustomer();
  const [newDeviceId, setNewDeviceId] = useState("");
  const [saving, setSaving] = useState(false);
  const axiosInstance = useAxiosInstance();

  const {
    data,
    isLoading: isLoadingTrmnl,
    mutate,
  } = useAxiosSWR({
    url: "/trmnl/device_id",
  });

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!customer?.features.trmnl) {
    return (
      <ErrorScreen>
        <p className="mb-4">🚩 This page is not found</p>
        <Link className="text-t2 hover:underline" to="/customers">
          Return to dashboard
        </Link>
      </ErrorScreen>
    );
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      await axiosInstance.post("/trmnl/device_id", {
        deviceId: newDeviceId,
      });
      await mutate();
      toast.success("Device ID saved");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to save device ID"));
    } finally {
      setSaving(false);
    }
  };

  const deviceId = data?.deviceId;

  return (
    <div className="flex flex-col h-full w-full items-center justify-center">
      <div className="flex flex-col font-mono gap-4 min-w-[300px]">
        <div className="flex items-center gap-2">
          <Terminal size={16} />
          <p>atmn.sh</p>
        </div>
        <div>
          {/* <p>
            1. Visit{" "}
            <a className="underline" href="https://trmnl.com/devices">
              usetrmnl.com
            </a>{" "}
            and add your device
          </p>
          <p>2. Enter your trmnl device ID:</p> */}

          <p>Enter your TRMNL device ID</p>
        </div>
        <Input
          value={newDeviceId}
          onChange={(e) => setNewDeviceId(e.target.value)}
          className="bg-transparent shadow-none"
          placeholder={deviceId ? `Current device: ${deviceId}` : "eg. 1A0E72"}
        />
        <Button isLoading={saving} disabled={!newDeviceId} onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
};
