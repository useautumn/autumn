import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCustomer } from "autumn-js/react";
import { Terminal } from "lucide-react";
import { Link } from "react-router";
import ErrorScreen from "./general/ErrorScreen";
import LoadingScreen from "./general/LoadingScreen";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getBackendErr } from "@/utils/genUtils";
import { ToggleButton } from "@/components/general/ToggleButton";

type TrmnlConfig = {
  deviceId: string;
  hideRevenue: boolean;
};

export const TerminalView = () => {
  const { customer, isLoading } = useCustomer();
  const [trmnlConfig, setTrmnlConfig] = useState<TrmnlConfig>({
    deviceId: "",
    hideRevenue: false,
  });
  const [saving, setSaving] = useState(false);
  const axiosInstance = useAxiosInstance();

  const {
    data,
    isLoading: isLoadingTrmnl,
    mutate,
  } = useAxiosSWR({
    url: "/trmnl/device_id",
    options: {
      refreshInterval: 0,
    },
  });

  useEffect(() => {
    if (data && data.trmnlConfig) {
      setTrmnlConfig({
        deviceId: data.trmnlConfig.deviceId,
        hideRevenue: data.trmnlConfig.hideRevenue,
      });
    }
  }, [data]);

  if (isLoading || isLoadingTrmnl) {
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
        deviceId: trmnlConfig.deviceId,
        hideRevenue: trmnlConfig.hideRevenue,
      });
      await mutate();
      toast.success("Device ID saved");
    } catch (error) {
      toast.error(getBackendErr(error, "Failed to save device ID"));
    } finally {
      setSaving(false);
    }
  };

  const deviceId = trmnlConfig.deviceId;

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
          value={deviceId}
          onChange={(e) =>
            setTrmnlConfig({
              ...trmnlConfig,
              deviceId: e.target.value,
            })
          }
          className="bg-transparent shadow-none"
          placeholder={deviceId ? `Current device: ${deviceId}` : "eg. 1A0E72"}
        />
        <div className="p-2 bg-stone-100 rounded-md">
          <p className="text-t3 text-xs font-bold">Options</p>
          <ToggleButton
            value={trmnlConfig?.hideRevenue}
            setValue={() =>
              setTrmnlConfig({
                ...trmnlConfig,
                hideRevenue: !trmnlConfig.hideRevenue,
              })
            }
            buttonText="Hide revenue"
            infoContent="Enable this for privacy if you don't want to show revenue numbers on your display"
            className="text-sm"
          />
        </div>
        <Button isLoading={saving} disabled={!deviceId} onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
};
