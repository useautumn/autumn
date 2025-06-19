import { AppEnv } from "@autumn/shared";
import CopyButton from "@/components/general/CopyButton";
import { useEnv } from "@/utils/envUtils";

export const PublishableKeySection = ({
  org,
}: {
  org: { test_pkey: string; live_pkey: string };
}) => {
  const env = useEnv();
  return (
    <div>
      <div className="border-y bg-surface-3 px-10 h-10 flex items-center">
        <h2 className="text-sm text-t2 font-medium">Publishable Key</h2>
      </div>
      <div className="px-10 py-4 flex flex-col gap-6">
        <p className="text-sm text-t3">
          You can safely use this from your frontend with certain endpoints,
          such as <span className="font-mono text-red-500">/attach</span> and{" "}
          <span className="font-mono text-red-500">/entitled</span>.
        </p>
        <div className="flex flex-col gap-2 w-fit rounded-sm ">
          {env === AppEnv.Sandbox ? (
            <CopyPublishableKey type="Sandbox" value={org?.test_pkey} />
          ) : (
            <CopyPublishableKey type="Production" value={org?.live_pkey} />
          )}
        </div>
      </div>
    </div>
  );
};

export const CopyPublishableKey = ({
  type,
  value,
}: {
  type: "Sandbox" | "Production";
  value: string;
}) => {
  return (
    <div className="flex flex-col justify-between gap-2 w-full">
      <div className="flex items-center whitespace-nowrap overflow-hidden">
        <div className="text-sm text-t3">{type}</div>
      </div>

      <CopyButton text={value}>{value}</CopyButton>
    </div>
  );
};
