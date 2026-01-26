import { AttachBranch } from "@autumn/shared";
import React from "react";
import { useProductContext } from "@/views/products/product/ProductContext";
import { AttachNewItems } from "./attach-preview/AttachNewItems";
import { DueNextCycle } from "./attach-preview/DueNextCycle";
import { DueToday } from "./attach-preview/DueToday";
import { OptionsInput } from "./attach-preview/OptionsInput";
import { UpdateQuantity } from "./attach-preview/UpdateQuantity";

export const AttachPreviewDetails = () => {
	const { attachState } = useProductContext();
	const { preview } = attachState;

	if (!preview) {
		return null;
	}

	const branch = preview.branch;
	const isUpdatePrepaidQuantity = branch == AttachBranch.UpdatePrepaidQuantity;

	return (
		<React.Fragment>
			<UpdateQuantity />
			{!isUpdatePrepaidQuantity && (
				<>
					<DueToday />
					<AttachNewItems />
				</>
			)}
			<DueNextCycle />
		</React.Fragment>
	);
};
