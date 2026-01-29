import type {
	ConfirmCheckoutResponse,
	GetCheckoutResponse,
} from "@autumn/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { checkoutApi } from "@/api/checkoutClient";

type CheckoutState =
	| { status: "loading" }
	| { status: "error"; message: string }
	| { status: "loaded"; data: GetCheckoutResponse }
	| { status: "confirming"; data: GetCheckoutResponse }
	| { status: "confirmed"; result: ConfirmCheckoutResponse };

export function CheckoutPage() {
	const { checkoutId } = useParams<{ checkoutId: string }>();
	const [state, setState] = useState<CheckoutState>({ status: "loading" });

	useEffect(() => {
		if (!checkoutId) {
			setState({ status: "error", message: "Missing checkout ID" });
			return;
		}

		const loadCheckout = async () => {
			try {
				const data = await checkoutApi.getCheckout({ checkout_id: checkoutId });
				setState({ status: "loaded", data });
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to load checkout";
				setState({ status: "error", message });
			}
		};

		loadCheckout();
	}, [checkoutId]);

	const handleConfirm = async () => {
		if (state.status !== "loaded" || !checkoutId) return;

		setState({ status: "confirming", data: state.data });

		try {
			const result = await checkoutApi.confirmCheckout({
				checkout_id: checkoutId,
			});
			setState({ status: "confirmed", result });
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to confirm checkout";
			setState({ status: "error", message });
		}
	};

	if (state.status === "loading") {
		return <LoadingState />;
	}

	if (state.status === "error") {
		return <ErrorState message={state.message} />;
	}

	if (state.status === "confirmed") {
		return <SuccessState result={state.result} />;
	}

	const { preview } = state.data;
	const isConfirming = state.status === "confirming";

	return (
		<div className="checkout-container">
			<h1>Checkout</h1>

			<div className="checkout-card">
				<div className="line-items">
					{preview.line_items.map((item) => (
						<div key={item.description} className="line-item">
							<span className="description">{item.description}</span>
							<span className="amount">
								{formatAmount(item.amount, preview.currency)}
							</span>
						</div>
					))}
				</div>

				<div className="divider" />

				<div className="total-row">
					<span className="total-label">Total due today</span>
					<span className="total-amount">
						{formatAmount(preview.total, preview.currency)}
					</span>
				</div>

				{preview.next_cycle && (
					<div className="next-cycle">
						<span className="next-cycle-label">Next billing cycle</span>
						<span className="next-cycle-info">
							{formatAmount(preview.next_cycle.total, preview.currency)}{" "}
							starting {formatDate(preview.next_cycle.starts_at)}
						</span>
					</div>
				)}

				<button
					type="button"
					className="confirm-button"
					onClick={handleConfirm}
					disabled={isConfirming}
				>
					{isConfirming ? "Processing..." : "Confirm Purchase"}
				</button>
			</div>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="checkout-container">
			<div className="checkout-card loading-card">
				<div className="spinner" />
				<p>Loading checkout...</p>
			</div>
		</div>
	);
}

function ErrorState({ message }: { message: string }) {
	return (
		<div className="checkout-container">
			<div className="checkout-card error-card">
				<h2>Something went wrong</h2>
				<p>{message}</p>
			</div>
		</div>
	);
}

function SuccessState({ result }: { result: ConfirmCheckoutResponse }) {
	return (
		<div className="checkout-container">
			<div className="checkout-card success-card">
				<div className="success-icon">✓</div>
				<h2>Purchase Complete</h2>
				<p>Your order has been confirmed.</p>
				{result.invoice_id && (
					<p className="invoice-info">Invoice ID: {result.invoice_id}</p>
				)}
			</div>
		</div>
	);
}

function formatAmount(cents: number, currency: string): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: currency.toUpperCase(),
	}).format(cents / 100);
}

function formatDate(timestamp: number): string {
	return new Date(timestamp * 1000).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}
