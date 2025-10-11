import {
	FeatureType,
	FeatureUsageType,
	type MeteredConfig,
} from "@autumn/shared";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { slugify } from "@/utils/formatUtils/formatTextUtils";
import { nullish } from "@/utils/genUtils";
import { SelectFeatureType } from "./SelectFeatureType";
import { SelectFeatureUsageType } from "./SelectFeatureUsageType";

export function FeatureConfig({
	feature,
	setFeature,
	eventNameInput,
	setEventNameInput,
	isUpdate = false,
	eventNameChanged,
	setEventNameChanged,
	open,
}: {
	feature: any;
	setFeature: any;
	eventNameInput: string;
	setEventNameInput: any;
	isUpdate?: boolean;
	eventNameChanged: boolean;
	setEventNameChanged: any;
	open: boolean;
}) {
	const [fields, setFields] = useState(
		feature.name
			? {
					name: feature.name,
					id: feature.id,
				}
			: {
					name: "",
					id: "",
				},
	);

	const [meteredConfig, setMeteredConfig] = useState<MeteredConfig>(
		feature.type === FeatureType.Metered
			? feature.config
			: {
					filters: [
						{
							property: "",
							operator: "",
							value: [],
						},
					],
					usage_type: FeatureUsageType.SingleUse,
				},
	);

	const [eventNames, setEventNames] = useState<string[]>(
		feature.event_names || [],
	);

	const [showEventName, setShowEventName] = useState(
		feature.event_names && feature.event_names.length > 0,
	);
	const [idChanged, setIdChanged] = useState(!!feature.id);

	// Helper function to update meteredConfig and sync to parent
	const updateMeteredConfig = (newConfig: MeteredConfig) => {
		setMeteredConfig(newConfig);
		if (feature.type === FeatureType.Metered) {
			setFeature({ ...feature, config: newConfig });
		}
	};

	// Helper function to update event names and sync to parent
	const updateEventNames = (newEventNames: string[]) => {
		setEventNames(newEventNames);
		setFeature({ ...feature, event_names: newEventNames });
	};

	const showNameAndId = () => {
		if (nullish(feature.type)) {
			return false;
		}

		if (feature.type === FeatureType.Metered && nullish(feature.usage_type)) {
			return false;
		}

		return true;
	};

	return (
		<div className="flex flex-col gap-4 min-w-md max-w-md">
			<div className="text-sm text-t2 flex items-center gap-1">
				Features are the parts of your application that customers get access to
				when purchasing a product
			</div>
			<SelectFeatureType feature={feature} setFeature={setFeature} />
			{feature.type === FeatureType.Metered && (
				<SelectFeatureUsageType feature={feature} setFeature={setFeature} />
			)}

			{showNameAndId() && (
				<>
					<div className="flex gap-2 w-full">
						<div className="w-full">
							<FieldLabel>Name</FieldLabel>
							<Input
								placeholder="Eg. messages, seats"
								value={feature.name}
								onChange={(e) => {
									const newFields: any = { ...feature, name: e.target.value };
									if (!idChanged) {
										newFields.id = slugify(e.target.value);
									}
									setFeature(newFields);

									if (!eventNameChanged) {
										setEventNameInput(slugify(e.target.value));
									}
								}}
							/>
						</div>
						<div className="w-full">
							<FieldLabel>ID</FieldLabel>
							<Input
								// disabled={isUpdate}
								placeholder="ID"
								value={feature.id}
								onChange={(e) => {
									setFeature({ ...feature, id: e.target.value });
									setIdChanged(true);
								}}
							/>
						</div>
					</div>

					{/* Filter */}
					{feature.type === FeatureType.Metered && (
						<>
							<div className={showEventName ? "" : "hidden"}>
								<FieldLabel>Event Name</FieldLabel>

								<FilterInput
									eventNames={eventNames}
									setEventNames={updateEventNames}
									eventNameInput={eventNameInput}
									setEventNameInput={setEventNameInput}
									setEventNameChanged={setEventNameChanged}
								/>
								<p className="text-sm text-t3 mt-2 px-2">
									Event names are only required if you want to link one event
									from your application to multiple feature balances. Read more{" "}
									<a
										href="https://docs.useautumn.com/features/tracking-usage#using-event-names"
										target="_blank"
										rel="noreferrer"
										className="text-primary underline"
									>
										here.
									</a>
								</p>
							</div>
							<div>
								<Tooltip delayDuration={400}>
									<TooltipTrigger asChild>
										<Button
											className={cn(
												"h-7 border rounded-none text-t3 text-xs",
												showEventName && "text-red-300",
											)}
											variant="outline"
											startIcon={
												showEventName ? (
													<XIcon size={12} />
												) : (
													<PlusIcon size={12} />
												)
											}
											onClick={() => {
												setShowEventName(!showEventName);
											}}
										>
											<span className="font-mono ">event_name</span>
										</Button>
									</TooltipTrigger>
									<TooltipContent sideOffset={5} side="bottom" align="start">
										<p>Link feature to multiple separate events</p>
									</TooltipContent>
								</Tooltip>
							</div>
						</>
					)}
				</>
			)}
		</div>
	);
}

export const FilterInput = ({
	eventNames,
	setEventNames,
	eventNameInput,
	setEventNameInput,
	setEventNameChanged,
}: {
	eventNames: string[];
	setEventNames: (eventNames: string[]) => void;
	eventNameInput: string;
	setEventNameInput: any;
	setEventNameChanged: any;
}) => {
	const [inputFocused, setInputFocused] = useState(false);

	const enterClicked = () => {
		if (eventNameInput.trim()) {
			setEventNames([...eventNames, eventNameInput.trim()]);
			setEventNameInput("");
			setEventNameChanged(true);
		}
	};

	const onRemoveClicked = (index: number) => {
		const newEventNames = [...eventNames];
		newEventNames.splice(index, 1);
		setEventNames(newEventNames);
	};

	useHotkeys("enter", enterClicked, {
		enableOnFormTags: ["input"],
		enabled: inputFocused,
	});
	return (
		<div
			className={cn(
				`p-2 py-2 h-fit rounded-md border text-sm w-full transition-colors duration-100 
        flex items-center flex-wrap gap-2 gap-y-2 bg-white`,
				inputFocused &&
					"border-primary shadow-[0_0_2px_1px_rgba(139,92,246,0.25)]",
			)}
		>
			{eventNames.map((value: string, index: number) => (
				<div
					key={index}
					className="flex items-center gap-2 border border-zinc-300 bg-zinc-50 rounded-full pl-3 pr-2 py-1 text-xs"
				>
					{value}
					<button
						type="button"
						className="text-zinc-500"
						onClick={() => onRemoveClicked(index)}
					>
						<XIcon size={15} />
					</button>
				</div>
			))}
			<input
				className="outline-none w-[10px] flex-grow"
				placeholder="eg. chat-messages"
				onFocus={() => setInputFocused(true)}
				onBlur={() => setInputFocused(false)}
				value={eventNameInput}
				onChange={(e) => {
					setEventNameInput(e.target.value);
					setEventNameChanged(true);
				}}
			></input>
		</div>
	);
};

{
	/* {featureType === FeatureType.Metered && (
        <div className="w-full">
          <div className="flex flex-col gap-2">
            <Tabs
              defaultValue={FeatureUsageType.SingleUse}
              value={meteredConfig.usage_type}
              onValueChange={(value) => {
                setMeteredConfig({
                  ...meteredConfig,
                  usage_type: value as FeatureUsageType,
                });
              }}
            >
              <TabsList className="-mx-2">
                <TabsTrigger
                  value={FeatureUsageType.SingleUse}
                  className="flex items-center gap-1"
                >
                  <Zap className="h-3 w-3 text-t3" />
                  <span>Single Use</span>
                </TabsTrigger>
                <TabsTrigger
                  value={FeatureUsageType.ContinuousUse}
                  className="flex items-center gap-1"
                >
                  <Clock className="h-3 w-3 text-t3" />
                  <span>Continuous Use</span>
                </TabsTrigger>
              </TabsList>
              <p className="text-sm text-t3 flex items-center gap-1">
                {meteredConfig.usage_type === FeatureUsageType.ContinuousUse
                  ? "For features used on an ongoing basis, like 'seats' or 'storage'"
                  : "For features that are consumed and refilled like 'credits' or 'API calls'"}
                <Tooltip delayDuration={400}>
                  <TooltipTrigger asChild>
                    <InfoIcon className="w-3 h-3 text-t3/50" />
                  </TooltipTrigger>
                  <TooltipContent
                    sideOffset={5}
                    side="top"
                    align="start"
                    className="flex flex-col"
                  >
                    <p>
                      Single use features can have a reset period, to refill a
                      balance every month, day etc. Existing usage is also
                      typically reset on upgrades.
                      <br />
                      <br />
                      Continuous use features don't have a reset period. They
                      can be prorated (eg, if a seat is purchased halfway during
                      the month, it'll cost half the price).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </p>
            </Tabs>
          </div>
        </div>
      )} */
}

{
	/* <Tabs
        defaultValue={feature.type}
        className="w-[400px]"
        value={featureType}
        onValueChange={setFeatureType}
      >
        <TabsList className="-ml-2">
          <TabsTrigger value={FeatureType.Metered}>Metered</TabsTrigger>
          <TabsTrigger value={FeatureType.Boolean}>Boolean</TabsTrigger>
        </TabsList>
        <p className="text-t3 text-sm">
          {featureType == FeatureType.Metered &&
            "A usage-based feature that you want to track"}
          {featureType == FeatureType.Boolean &&
            "A feature flag that can be either enabled or disabled"}
        </p>
      </Tabs> */
}
