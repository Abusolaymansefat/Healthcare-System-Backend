import {
	AppointmentStatus,
	PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";

//  create a function to book appointment and return the bkash card payment result
const bookAppointment = async (payload: any, user: RequestUser) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointment = await tx.appointment.create({
			data: {
				status: AppointmentStatus.PENDING,
			},
		});
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
					payerReference: user.email,
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					amount: "590",
					currency: "BDT",
					intent: "sale",
					merchantInvoiceNumber: appointment.id,
				}),
			},
		);

		const bkashCardPaymentResult = await bkashCardPaymentResponse.json();

		// payment modle create
		await tx.payment.create({
			data: {
				merchantInvoiceNumber: bkashCardPaymentResult.merchantInvoiceNumber,
				appointmentId: appointment.id,
				amount: "1200",
				getwayResponse: bkashCardPaymentResult,
				bkashPaymentId: bkashCardPaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		// console.log("bkashCardPaymentResult", bkashCardPaymentResult);

		return {
			paymentUrl: bkashCardPaymentResult.bkashURL,
		};
	});
	return transactionResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
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
			await tx.appointment.update({
				where: {
					id: executePaymentResult.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
				},
			});

			await tx.payment.update({
				where: {
					appointmentId: executePaymentResult.merchantInvoiceNumber,
					bkashPaymentId: paymentID,
				},
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: executePaymentResult.trxID,
					paidAt: executePaymentResult.paymentExecuteTime,
					getwayResponse: executePaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (status === "failure") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentID,
				},
				data: {
					status: PaymentStatus.FAILED,
					getwayResponse: executePaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
			};
		} else if (status === "cancel") {
			await tx.payment.update({
				where: {
					bkashPaymentId: paymentID,
				},
				data: {
					status: PaymentStatus.CANCELED,
					getwayResponse: executePaymentResult,
				},
			});
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
			};
		} else {
			return {
				executePaymentResult,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
			};
		}
	});
	return transactionResult;
};


export const AppointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
