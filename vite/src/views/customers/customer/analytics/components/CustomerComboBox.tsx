"use client";

import { CaretDownIcon } from "@phosphor-icons/react";
import { debounce } from "lodash";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/v2/buttons/Button";
import { IconButton } from "@/components/v2/buttons/IconButton";
import { useAxiosPostSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";

import { useAnalyticsContext } from "../AnalyticsContext";

interface CustomerSearchResult {
	id: string;
	internal_id?: string;
	name?: string;
	email?: string;
}

export function CustomerComboBox({
	classNames,
}: {
	classNames?: {
		trigger?: string;
	};
}) {
	const env = useEnv();
	const navigate = useNavigate();
	const location = useLocation();
	const { customer, setHasCleared } = useAnalyticsContext();
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState("");
	const [isSearching, setIsSearching] = useState(false);

	const { data, mutate } = useAxiosPostSWR({
		url: `/v1/customers/all/search`,
		env,
		data: {
			search: value || "",
			page_size: 25,
		},
	});

	const debouncedSearch = useCallback(
		debounce(async () => {
			setIsSearching(true);
			try {
				await mutate();
			} catch (error) {
				console.error("Search failed:", error);
			} finally {
				setIsSearching(false);
			}
		}, 300),
		[mutate],
	);

	useEffect(() => {
		if (value) {
			debouncedSearch();
		} else {
			setIsSearching(false);
		}

		return () => {
			debouncedSearch.cancel();
		};
	}, [value, debouncedSearch]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<IconButton
					variant="secondary"
					size="default"
					icon={<CaretDownIcon size={12} weight="bold" />}
					iconOrientation="right"
					onClick={() => {
						setValue("");
					}}
				>
					<span className="w-full truncate">
						{customer?.name || customer?.id || "All customers"}
					</span>
				</IconButton>
			</PopoverTrigger>
			<PopoverContent className="w-[300px] p-0" align="start">
				<Command filter={() => 1}>
					<CommandInput
						placeholder="Search customer..."
						className="h-9"
						onValueChange={(e) => setValue(e)}
					/>
					<CommandList>
						{isSearching ? (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="animate-spin text-t3" size={14} />
								<span className="ml-2 text-sm text-muted-foreground">
									Searching...
								</span>
							</div>
						) : (
							<>
								<CommandEmpty className="py-2 text-center">
									<p className="mb-2 text-sm text-muted-foreground">
										{value ? "No customer found." : "Search for a customer"}
									</p>
									<Button
										variant="secondary"
										size="sm"
										className="mx-auto"
										onClick={() => {
											const params = new URLSearchParams(location.search);
											params.delete("customer_id");
											const queryString = params.toString();
											const path = queryString
												? `/analytics?${queryString}`
												: "/analytics";
											navigateTo(path, navigate, env);
											setOpen(false);
											setHasCleared(false);
										}}
									>
										Or select all customers
									</Button>
								</CommandEmpty>
								<CommandGroup>
									{value &&
										data?.customers &&
										data?.customers?.map(
											(c: CustomerSearchResult, idx: number) => {
												if (c.name === customer?.name) {
													return null;
												}
												return (
													<CommandItem
														key={idx}
														value={c.id || c.internal_id}
														onSelect={() => {
															const params = new URLSearchParams(
																location.search,
															);
															params.set("customer_id", c.id);
															const path = `/analytics?${params.toString()}`;
															navigateTo(path, navigate, env);
															setOpen(false);
														}}
														className="w-full"
													>
														{c.name || c.email}{" "}
														<span className="text-xs text-t3">
															{c.id && `(${c.id.slice(0, 10)}...)`}
														</span>
													</CommandItem>
												);
											},
										)}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
