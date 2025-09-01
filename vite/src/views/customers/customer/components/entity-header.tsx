import type { Entity } from "@autumn/shared";
import { X } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";

export const EntityHeader = ({ entity }: { entity?: Entity }) => {
	const location = useLocation();
	const navigate = useNavigate();

	if (!entity) {
		return null;
	}

	return (
		<div className="flex items-center gap-2 bg-muted/50 text-t2 text-sm px-3 py-1 rounded-md pr-1 h-6">
			<span className="">Entity:</span>
			<span className="font-mono">{entity.name}</span>
			<Button
				variant="ghost"
				size="icon"
				className="w-5 h-5 hover:bg-zinc-200 rounded-md"
				onClick={() => {
					const params = new URLSearchParams(location.search);
					params.delete("entity_id");
					navigate(`${location.pathname}?${params.toString()}`);
				}}
			>
				<X size={14} />
			</Button>
		</div>
	);
};
