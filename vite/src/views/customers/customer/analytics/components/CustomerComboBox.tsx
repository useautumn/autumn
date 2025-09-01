"use client";

import { debounce } from "lodash";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import * as React from "react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import { useAxiosPostSWR } from "@/services/useAxiosSwr";
import { useEnv } from "@/utils/envUtils";
import { navigateTo } from "@/utils/genUtils";
import { useAnalyticsContext } from "../AnalyticsContext";

export function CustomerComboBox({
	classNames,
}: {
	classNames?: {
		trigger?: string;
	};
}) {
	const env = useEnv();
	const navigate = useNavigate();
	const { customer, setHasCleared } = useAnalyticsContext();
	const [open, setOpen] = React.useState(false);
	const [value, setValue] = React.useState("");
	const [isSearching, setIsSearching] = React.useState(false);

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
		[],
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
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					className={cn(
						"w-[150px] justify-between text-xs",
						classNames?.trigger,
					)}
					onClick={() => {
						setValue("");
					}}
				>
					<span className="w-full truncate">
						{customer?.name || customer?.id || "All customers"}
					</span>
					<ChevronsUpDown className="opacity-50 h-4 w-4" />
				</Button>
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
										variant="outline"
										size="sm"
										className="mx-auto"
										onClick={() => {
											navigateTo("/analytics", navigate, env);
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
										data?.customers?.map((c: any, idx: number) => {
											if (c.name === customer?.name) {
												return null;
											}
											return (
												<CommandItem
													key={idx}
													value={c.id || c.internal_id}
													onSelect={() => {
														navigateTo(
															`/analytics?customer_id=${c.id}`,
															navigate,
															env,
														);
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
										})}
								</CommandGroup>
							</>
						)}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
