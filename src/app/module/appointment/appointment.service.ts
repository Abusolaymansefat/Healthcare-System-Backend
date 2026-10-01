import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

//  create a function to book appointment and return the bkash card payment result
const bookAppointment = async () => {
	const bakashIdToken = await getBkashIdToken();
	if (!bakashIdToken) {
		throw new Error("Bkash Id Token Not Found");
	}

	const bkashCardPaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bakashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				mode: "0011",
				payerReference: "TEST001ABC",
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
				amount: "2.90",
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: "test001",
			}),
		},
	);

	const bkashCardPaymentResult = await bkashCardPaymentResponse.json();

	// console.log("bkashCardPaymentResult", bkashCardPaymentResult);

	return bkashCardPaymentResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const paymentID = query.paymentID;

	if (!paymentID) {
		throw new Error("paymentId messing in query params");
	}

	const status = query.Status;

	if (status) {
		throw new Error("payment status is messing");
	}

	const bkashIdToken = await getBkashIdToken();
	if (!bkashIdToken) {
		throw new Error("Bkash Id Token Not Found");
	}

	const executePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				paymentID: paymentID,
			}),
		},
	);

	const executePaymentResult = await executePaymentResponse.json();

	if (status === "success") {
		return {
			executePaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
		};
	}
	if (status === "failure") {
		return {
			executePaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failue`,
		};
	}
	if (status === "cancel") {
		return {
			executePaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	}

	return {
		executePaymentResult,
		redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
	};
};

export const AppointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
