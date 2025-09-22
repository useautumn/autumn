import FieldLabel from "@/components/general/modal-components/FieldLabel";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEffect } from "react";
import { useState } from "react";
import { CreateFreeTrial, FreeTrialDuration } from "@autumn/shared";
import {
	Select,
	SelectItem,
	SelectContent,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export const FreeTrialConfig = ({
	freeTrial,
	setFreeTrial,
}: {
	freeTrial: CreateFreeTrial;
	setFreeTrial: (freeTrial: CreateFreeTrial) => void;
}) => {
	const [fields, setFields] = useState<CreateFreeTrial>({
		length: freeTrial?.length || 7,
		unique_fingerprint: freeTrial?.unique_fingerprint || false,
		duration: freeTrial?.duration || FreeTrialDuration.Day,
		card_required: freeTrial?.card_required ?? true,
	});

	useEffect(() => {
		setFreeTrial(fields);
	}, [fields, freeTrial, setFreeTrial]);

	return (
		<div className="flex flex-col gap-4 text-sm">
			<div>
				<FieldLabel>Length</FieldLabel>
				<Input
					value={fields.length}
					onChange={(e) =>
						setFields({ ...fields, length: e.target.value as any })
					}
					type="number"
					endContent={
						<Select
							value={freeTrial.duration}
							onValueChange={(value) =>
								setFields({
									...fields,
									duration: value as FreeTrialDuration,
								})
							}
						>
							<SelectTrigger className="border-none shadow-none my-1 bg-transparent">
								<SelectValue placeholder="Days">
									{freeTrial.duration}
								</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{Object.values(FreeTrialDuration).map((duration) => (
									<SelectItem key={duration} value={duration}>
										{duration}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					}
				/>
			</div>
			<div className="flex items-center gap-2">
				<Checkbox
					checked={fields.unique_fingerprint}
					onCheckedChange={(checked) =>
						setFields({ ...fields, unique_fingerprint: checked as boolean })
					}
				/>
				<p className="">
					Only allow one free trial per customer{" "}
					<span className=" font-mono">fingerprint</span>
				</p>
			</div>

			<div className="flex items-center gap-2">
				<Checkbox
					checked={fields.card_required}
					onCheckedChange={(checked) =>
						setFields({ ...fields, card_required: checked as boolean })
					}
				/>
				<p className="">Card required</p>
			</div>
		</div>
	);
};
