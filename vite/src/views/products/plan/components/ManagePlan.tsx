import PlanCard from "./PlanCard/PlanCard";

export const ManagePlan = () => {
	return (
		<div className="flex flex-col gap-4 h-full overflow-hidden">
			<div className="flex flex-col h-full bg-[#EEEEEE] items-center justify-start pt-20">
				<PlanCard />
			</div>
		</div>
	);
};
