import { CheckIcon, CopyIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DevService } from "@/services/DevService";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useEnv } from "@/utils/envUtils";
import { DevContext } from "@/views/developer/DevContext";

export const CreateSecretKey = ({
	apiKey,
	setApiKey,
}: {
	apiKey: string;
	setApiKey: (apiKey: string) => void;
}) => {
	const env = useEnv();
	// const [apiKeyName, setApiKeyName] = useState("");
	const [apiCreated, setApiCreated] = useState(false);

	const [loading, setLoading] = useState(false);
	const [copied, setCopied] = useState(false);
	const axiosInstance = useAxiosInstance({ env });

	const handleCreate = async () => {
		setLoading(true);
		try {
			const { api_key } = await DevService.createAPIKey(axiosInstance, {
				name: "Autumn Onboarding",
			});

			setApiKey(api_key);
		} catch (error) {
			console.log("Error:", error);
			toast.error("Failed to create API key");
		}

		setLoading(false);
	};

	return (
		<DevContext.Provider
			value={{
				mutate: () => {},
				onboarding: true,
				apiCreated,
				setApiCreated,
			}}
		>
			<div className="flex flex-col gap-2 w-full">
				{apiKey ? (
					<div className="flex gap-2">
						<Input value={apiKey} disabled className="w-[600px]" />
						<Button
							variant="secondary"
							className="text-xs text-t3 flex gap-2 rounded-md shadow-none"
							endIcon={
								copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />
							}
							onClick={() => {
								navigator.clipboard.writeText(apiKey);
								setCopied(true);
								setTimeout(() => {
									setCopied(false);
								}, 1000);
							}}
						>
							Copy
						</Button>
					</div>
				) : (
					<div className="flex gap-2">
						{/* <Input
              placeholder="Secret API Key Name"
              className="w-full"
              value={apiKeyName}
              disabled={apiCreated}
              onChange={(e) => setApiKeyName(e.target.value)}
            /> */}
						<Button
							onClick={handleCreate}
							isLoading={loading}
							variant="outline"
							startIcon={<PlusIcon size={14} />}
						>
							Create Secret Key
						</Button>
					</div>
				)}
			</div>
		</DevContext.Provider>
	);
};

{
	/* <div className="border rounded-sm px-2 py-1">
                {env === AppEnv.Sandbox ? (
                  <CopyPublishableKey
                    type="Sandbox"
                    value={productData?.org?.test_pkey}
                  />
                ) : (
                  <CopyPublishableKey
                    type="Production"
                    value={productData?.org?.live_pkey}
                  />
                )}
              </div> */
}
