import { FieldLabel, TagInput } from "@autumn/ui";
import { useState } from "react";

export const WithTags = () => {
	const [tags, setTags] = useState<string[]>([
		"api_credits",
		"seats",
		"storage_gb",
	]);
	return <TagInput value={tags} onChange={setTags} />;
};

export const Empty = () => {
	const [tags, setTags] = useState<string[]>([]);
	return (
		<div className="flex flex-col gap-1">
			<TagInput
				value={tags}
				onChange={setTags}
				placeholder="Add a feature ID..."
			/>
			<span className="text-xs text-muted-foreground">
				Press space or enter to add a tag
			</span>
		</div>
	);
};

export const WithLabel = () => {
	const [tags, setTags] = useState<string[]>(["acme.com", "acme-corp.io"]);
	return (
		<div className="flex flex-col">
			<FieldLabel description="Customers signing up from these domains join this org">
				Allowed email domains
			</FieldLabel>
			<TagInput
				value={tags}
				onChange={setTags}
				placeholder="Add a domain..."
			/>
		</div>
	);
};
