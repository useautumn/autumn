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
      <div className="absolute bottom-20 p-10 bg-zinc-100 text-sm flex flex-col gap-1 text-t2/90">
        <p className="font-bold">To link Autumn to TRMNL:</p>
        <p>
          1. Follow this{" "}
          <a
            href="https://help.usetrmnl.com/en/articles/9416306-how-to-set-up-a-new-device"
            className="underline"
            target="_blank"
          >
            guide
          </a>{" "}
          to set up your TRMNL
        </p>
        <p>2. Once you've gotten your device ID, enter it above.</p>
        <p>
          3. Visit this{" "}
          <a
            href="https://usetrmnl.com/recipes/119587/install_read_only?read_only=true"
            className="underline"
            target="_blank"
          >
            page
          </a>
          , enter your device ID in the input and click 'Save'
        </p>
        <p>
          4. You should be done now! Confirm that Autumn has been added to your
          playlist{" "}
          <a
            href="https://usetrmnl.com/playlists"
            className="underline"
            target="_blank"
          >
            here
          </a>
          .
        </p>
        <p>
          5. Read this{" "}
          <a
            href="https://help.usetrmnl.com/en/articles/10113695-how-refresh-rates-work"
            className="underline"
            target="_blank"
          >
            page
          </a>{" "}
          to learn more about TRMNL's refresh rates.
        </p>
      </div>
    </div>
  );
};
