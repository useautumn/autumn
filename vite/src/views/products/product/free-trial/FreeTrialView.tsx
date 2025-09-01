import { useState } from "react";
import { useAxiosInstance } from "@/services/useAxiosInstance";
import { useProductContext } from "../ProductContext";

export const FreeTrialView = ({ product }: { product: any }) => {
	const { mutate } = useProductContext();
	const _axiosInstance = useAxiosInstance();
	const [_defaultTrialOpen, _setDefaultTrialOpen] = useState(false);

	return (
		<>
			{product.free_trial && (
				<div className="flex justify-between gap-4 rounded-sm w-full">
					<div className="flex flex-col w-full gap-4">
						<div className="flex items-center w-full justify-between h-4">
							<p className="text-xs text-t3 font-medium text-center">Length </p>
							<p className="text-t2 pr-2">
								{product.free_trial.length} {product.free_trial.duration}
								{product.free_trial.length > 1 ? "s" : ""}
							</p>
						</div>
						<div className="flex items-center w-full justify-between h-4">
							<p className="text-xs text-t3 font-medium text-center">
								Limit by Fingerprint
							</p>
							<p className="text-t2 pr-2">
								{product.free_trial.unique_fingerprint ? (
									<span className="text-lime-600">True</span>
								) : (
									"False"
								)}
							</p>
						</div>

						<div className="flex items-center w-full justify-between h-4">
							<p className="text-xs text-t3 font-medium text-center">
								Card Required
							</p>
							<p className="text-t2 pr-2">
								{product.free_trial.card_required ? (
									<span className="text-lime-600">True</span>
								) : (
									"False"
								)}
							</p>
						</div>
					</div>
				</div>
			)}
			{/* {!product.free_trial && <CreateFreeTrial />} */}
		</>
	);
};
