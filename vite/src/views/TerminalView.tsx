import { useCustomer } from "autumn-js/react";
import { Info, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/v2/buttons/Button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/v2/cards/Card";
import { TextCheckbox } from "@/components/v2/checkboxes/TextCheckbox";
import { FormLabel } from "@/components/v2/form/FormLabel";
import { Input } from "@/components/v2/inputs/Input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/v2/tooltips/Tooltip";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useAxiosSWR } from "@/services/useAxiosSwr";
import { getBackendErr } from "@/utils/genUtils";
import LoadingScreen from "./general/LoadingScreen";

type TrmnlConfig = {
	deviceId: string;
	hideRevenue: boolean;
};

export const TerminalView = () => {
	const { isLoading } = useCustomer();
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
		if (data?.trmnlConfig) {
			setTrmnlConfig({
				deviceId: data.trmnlConfig.deviceId,
				hideRevenue: data.trmnlConfig.hideRevenue,
			});
		}
	}, [data]);

	if (isLoading || isLoadingTrmnl) {
		return <LoadingScreen />;
	}

	const handleSave = async () => {
		try {
			setSaving(true);
			const trimmedDeviceId = trmnlConfig.deviceId.trim();
			await axiosInstance.post("/trmnl/device_id", {
				deviceId: trimmedDeviceId,
				hideRevenue: trmnlConfig.hideRevenue,
			});
			setTrmnlConfig({
				...trmnlConfig,
				deviceId: trimmedDeviceId,
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
	const hasDeviceId = deviceId.trim().length > 0;

	return (
		<div className="w-full h-full overflow-auto">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8 sm:px-6">
				<Card className="shadow-none bg-interactive-secondary">
					<CardHeader className="gap-2">
						<CardTitle className="flex items-center gap-2 text-base text-t1">
							<Terminal className="size-4 text-t3" />
							TRMNL
						</CardTitle>
						<CardDescription>
							Connect your TRMNL device to show Autumn metrics on your display.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-4">
						<div className="w-full max-w-md">
							<FormLabel>Device ID</FormLabel>
							<Input
								value={deviceId}
								onChange={(e) =>
									setTrmnlConfig({
										...trmnlConfig,
										deviceId: e.target.value,
									})
								}
								placeholder="eg. 1A0E72"
							/>
						</div>

						<div className="flex items-center justify-between gap-3">
							<div className="rounded-md border bg-card px-2.5 py-1.5">
								<TextCheckbox
									checked={trmnlConfig.hideRevenue}
									onCheckedChange={(checked) => {
										setTrmnlConfig({
											...trmnlConfig,
											hideRevenue: checked === true,
										});
									}}
								>
									<span className="inline-flex items-center gap-1.5 text-sm">
										Hide revenue
										<Tooltip>
											<TooltipTrigger asChild>
												<span className="inline-flex cursor-pointer text-t3/70">
													<Info className="size-3.5" />
												</span>
											</TooltipTrigger>
											<TooltipContent sideOffset={8}>
												Enable this for privacy if you do not want to show revenue
												numbers on your display.
											</TooltipContent>
										</Tooltip>
									</span>
								</TextCheckbox>
							</div>
							<Button
								isLoading={saving}
								disabled={!hasDeviceId}
								onClick={handleSave}
							>
								Save
							</Button>
						</div>
					</CardContent>
				</Card>

				<Card className="shadow-none">
					<CardHeader>
						<CardTitle className="text-sm">Setup checklist</CardTitle>
						<CardDescription>
							Follow these steps to finish linking Autumn to TRMNL.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ol className="list-decimal space-y-2 pl-4 text-sm text-t2">
							<li>
								Follow this{" "}
								<a
									href="https://help.usetrmnl.com/en/articles/9416306-how-to-set-up-a-new-device"
									className="underline text-primary"
									target="_blank"
									rel="noopener noreferrer"
								>
									guide
								</a>{" "}
								to set up your TRMNL.
							</li>
							<li>Once you get your device ID, enter it above and save.</li>
							<li>
								Visit this{" "}
								<a
									href="https://usetrmnl.com/recipes/119587/install_read_only?read_only=true"
									className="underline text-primary"
									target="_blank"
									rel="noopener noreferrer"
								>
									recipe page
								</a>
								, enter your device ID, and click Save.
							</li>
							<li>
								Confirm Autumn was added to your playlist{" "}
								<a
									href="https://usetrmnl.com/playlists"
									className="underline text-primary"
									target="_blank"
									rel="noopener noreferrer"
								>
									here
								</a>
								.
							</li>
							<li>
								Read this{" "}
								<a
									href="https://help.usetrmnl.com/en/articles/10113695-how-refresh-rates-work"
									className="underline text-primary"
									target="_blank"
									rel="noopener noreferrer"
								>
									refresh rate guide
								</a>{" "}
								for scheduling details.
							</li>
						</ol>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};
