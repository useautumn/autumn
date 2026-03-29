import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useQueryKeyFactory } from "@/hooks/common/useQueryKeyFactory";
import { useAxiosInstance } from "@/services/useAxiosInstance";

export type RevenueByProductRow = {
	period_label: string;
	product_name: string;
	volume: number;
	currency: string;
};

export type ProductShareRow = {
	product_name: string;
	volume: number;
	currency: string;
};

export type ArpcRow = {
	period_label: string;
	arpc: number;
	customer_count: number;
	currency: string;
};

export type InvoiceStatusRow = {
	status: string;
	invoice_count: number;
	total_volume: number;
	currency: string;
};

export type CustomerLeaderboardRow = {
	internal_customer_id: string;
	customer_name: string | null;
	customer_id: string | null;
	customer_email: string | null;
	total_volume: number;
	invoice_count: number;
	currency: string;
};

export const useRevenueByProduct = ({
	granularity,
}: {
	granularity: string;
}) => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();
	const queryClient = useQueryClient();

	const fetchGranularity = async ({
		g,
	}: {
		g: string;
	}): Promise<RevenueByProductRow[]> => {
		const { data } = await axiosInstance.post("/query/revenue/by-product", {
			granularity: g,
		});
		return data as RevenueByProductRow[];
	};

	// Active query for selected granularity
	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-by-product", granularity]),
		queryFn: () => fetchGranularity({ g: granularity }),
		staleTime: 5 * 60 * 1000,
	});

	// Background prefetch other granularities so switching is instant
	useEffect(() => {
		for (const g of ["day", "month", "year"] as const) {
			if (g === granularity) continue;
			queryClient.prefetchQuery({
				queryKey: buildKey(["revenue-by-product", g]),
				queryFn: () => fetchGranularity({ g }),
				staleTime: 5 * 60 * 1000,
			});
		}
	}, [granularity, queryClient, buildKey, axiosInstance]);

	return { data, isLoading };
};

export const useRevenueProductShare = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-product-share"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/query/revenue/product-share",
				{},
			);
			return data as ProductShareRow[];
		},
		staleTime: 5 * 60 * 1000,
	});

	return { data, isLoading };
};

export const useArpc = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-arpc"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post("/query/revenue/arpc", {});
			return data as ArpcRow[];
		},
		staleTime: 5 * 60 * 1000,
	});

	return { data, isLoading };
};

export const useInvoiceStatus = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-invoice-status"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/query/revenue/invoice-status",
				{},
			);
			return data as InvoiceStatusRow[];
		},
		staleTime: 5 * 60 * 1000,
	});

	return { data, isLoading };
};

export const useCustomerLeaderboard = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-customer-leaderboard"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/query/revenue/customer-leaderboard",
				{},
			);
			return data as CustomerLeaderboardRow[];
		},
		staleTime: 5 * 60 * 1000,
	});

	return { data, isLoading };
};

export type EstimatedMrrResult = {
	estimated_mrr: number;
	active_subscriptions: number;
	currency: string;
};

export const useEstimatedMrr = () => {
	const axiosInstance = useAxiosInstance();
	const buildKey = useQueryKeyFactory();

	const { data, isLoading } = useQuery({
		queryKey: buildKey(["revenue-estimated-mrr"]),
		queryFn: async () => {
			const { data } = await axiosInstance.post(
				"/query/revenue/estimated-mrr",
				{},
			);
			return data as EstimatedMrrResult;
		},
		staleTime: 5 * 60 * 1000,
	});

	return { data, isLoading };
};
