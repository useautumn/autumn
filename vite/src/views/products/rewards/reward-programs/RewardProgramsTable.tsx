// import { useProductsContext } from "../ProductsContext";
import { useState } from "react";
import { formatUnixToDateTime } from "@/utils/formatUtils/formatDateUtils";
import { RewardProgram, RewardTriggerEvent } from "@autumn/shared";
import { keyToTitle } from "@/utils/formatUtils/formatTextUtils";
// import { RewardProgramRowToolbar } from "./RewardProgramRowToolbar";
import { Item, Row } from "@/components/general/TableGrid";
import { AdminHover } from "@/components/general/AdminHover";
import { useRewardsQuery } from "@/hooks/queries/useRewardsQuery";
import { RewardProgramRowToolbar } from "./RewardProgramRowToolbar";
import UpdateRewardProgram from "./UpdateRewardPrograms";

export const RewardProgramsTable = () => {
	const { rewardPrograms } = useRewardsQuery();
	const [selectedRewardProgram, setSelectedRewardProgram] =
		useState<RewardProgram | null>(null);
	const [open, setOpen] = useState(false);

	return (
		<>
			<UpdateRewardProgram
				open={open}
				setOpen={setOpen}
				selectedRewardProgram={selectedRewardProgram}
				setSelectedRewardProgram={setSelectedRewardProgram}
			/>
			{/* <UpdateRewardProgram component here /> */}

			{rewardPrograms && rewardPrograms.length > 0 ? (
				<Row type="header" className="grid-cols-18 -mb-1">
					<Item className="col-span-4">ID</Item>
					<Item className="col-span-4">Redeem On</Item>
					<Item className="col-span-4">Max Redemptions</Item>
					<Item className="col-span-3">Products</Item>
					<Item className="col-span-2">Created At</Item>
					<Item className="col-span-1"></Item>
				</Row>
			) : (
				<div className="flex justify-start items-center h-10 text-t3 px-10">
					Referral programs automatically grant rewards (defined above) to
					customers who invite new users.
				</div>
			)}

			{rewardPrograms.map((rewardProgram: RewardProgram) => (
				<Row
					key={rewardProgram.id}
					onClick={() => {
						setSelectedRewardProgram(rewardProgram);
						setOpen(true);
					}}
				>
					<Item className="col-span-4">
						<AdminHover
							texts={[{ key: "Internal ID", value: rewardProgram.internal_id }]}
						>
							<span className="font-mono truncate">{rewardProgram.id}</span>
						</AdminHover>
					</Item>
					<Item className="col-span-4">
						<span className="truncate">{rewardProgram.when}</span>
					</Item>
					<Item className="col-span-4">
						<div className="flex items-center gap-1">
							<p>
								{rewardProgram.unlimited_redemptions
									? "Unlimited"
									: rewardProgram.max_redemptions}
							</p>
						</div>
					</Item>
					<Item className="col-span-3">
						{rewardProgram.when == RewardTriggerEvent.CustomerCreation
							? "Sign Up"
							: rewardProgram.when == RewardTriggerEvent.Checkout
								? "Checkout"
								: keyToTitle(rewardProgram.when)}
					</Item>
					<Item className="col-span-2 text-t3 text-xs">
						{formatUnixToDateTime(rewardProgram.created_at).date}
						{/* <span className="text-t3">
              {" "}
              {formatUnixToDateTime(rewardProgram.created_at).time}
            </span> */}
					</Item>
					<Item className="col-span-1 items-center justify-end">
						<RewardProgramRowToolbar rewardProgram={rewardProgram} />
					</Item>
				</Row>
			))}
		</>
	);
};
