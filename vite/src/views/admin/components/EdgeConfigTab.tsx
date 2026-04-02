import { useState } from "react";
import { Button } from "@/components/v2/buttons/Button";
import { EdgeConfigDialog } from "./EdgeConfigDialog";
import { FeatureFlagsDialog } from "./FeatureFlagsDialog";
import { RawEdgeConfigDialog } from "./RawEdgeConfigDialog";

export function EdgeConfigTab() {
	const [requestBlockEditOpen, setRequestBlockEditOpen] = useState(false);
	const [requestBlockRawOpen, setRequestBlockRawOpen] = useState(false);
	const [featureFlagsOpen, setFeatureFlagsOpen] = useState(false);

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-lg border border-border overflow-hidden">
				<div className="flex items-center justify-between p-4 border-b border-border">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-t1">Feature Flags</div>
						<div className="text-xs text-t3">Toggle maintenance modes and feature gates globally.</div>
					</div>
					<Button
						variant="primary"
						size="sm"
						onClick={() => setFeatureFlagsOpen(true)}
					>
						Edit
					</Button>
				</div>

				<div className="flex items-center justify-between p-4 last:border-b-0">
					<div className="flex flex-col gap-0.5">
						<div className="text-sm font-medium text-t1">Request Blocking</div>
						<div className="text-xs text-t3">Block /v1 API requests org-wide or by endpoint pattern.</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={() => setRequestBlockRawOpen(true)}
						>
							Raw Edit
						</Button>
						<Button
							variant="primary"
							size="sm"
							onClick={() => setRequestBlockEditOpen(true)}
						>
							Edit
						</Button>
					</div>
				</div>
			</div>

			<FeatureFlagsDialog
				open={featureFlagsOpen}
				onOpenChange={setFeatureFlagsOpen}
			/>

			<EdgeConfigDialog
				open={requestBlockEditOpen}
				onOpenChange={(open) => {
					if (!open) setRequestBlockEditOpen(false);
				}}
				configId="request-block"
			/>

			<RawEdgeConfigDialog
				open={requestBlockRawOpen}
				onOpenChange={setRequestBlockRawOpen}
				configId="request-block"
			/>
		</div>
	);
}
