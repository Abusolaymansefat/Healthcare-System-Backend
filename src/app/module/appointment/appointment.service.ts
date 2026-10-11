import app from "../../../app";
import {
	AppointmentStatus,
	PaymentStatus,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";
import httpStatus from "http-status";
import { IBookAppointmentPayload } from "./appointment.interface";
import { isBefore, isSameDay } from "date-fns";

//  create a function to book appointment and return the bkash card payment result
const bookAppointment = async (
	payload: IBookAppointmentPayload,
	user: RequestUser,
) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const patient = await prisma.patient.findUnique({
			where: { userId: user.userId },
		});

		if (!patient) {
			throw new AppError(httpStatus.NOT_FOUND, "Patient not found");
		}

		const schedule = await prisma.schedule.findUnique({
			where: { id: payload.scheduleId },
			include: { doctor: true },
		});

		if (!schedule || schedule.isDeleted) {
			throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
		}

		if (schedule.status !== ScheduleStatus.PUBLISHED) {
			throw new AppError(httpStatus.FORBIDDEN, "Schedule is not published");
		}

		const now = new Date();

		if (!isSameDay(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Schedule is not available for today",
			);
		}

		if (!isBefore(now, schedule.startDateTime)) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Schedule is not available now",
			);
		}

		const existingAppointment = await prisma.appointment.findFirst({
			where: {
				patientId: patient.id,
				scheduleId: schedule.id,
				status: {
					// not: AppointmentStatus.CANCELLED
				},
			},
		});

		if (existingAppointment?.status === AppointmentStatus.PENDING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a pending appointment",
			);
		}

		if (existingAppointment?.status === AppointmentStatus.CONFIRMED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a confirmed appointment",
			);
		}

		if (existingAppointment?.status === AppointmentStatus.ONGOING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have an ongoing appointment",
			);
		}

		if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"You already have a completed appointment",
			);
		}

		if (schedule.availableSlots === 0) {
			throw new AppError(httpStatus.BAD_REQUEST, "Schedule is full");
		}

		if (!schedule.doctor.consultationFee) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Doctor consultation fee is not set",
			);
		}

		const amount = schedule.doctor.consultationFee.toString();

		const appointment = await tx.appointment.create({
			data: {
				status: AppointmentStatus.PENDING,
				patientId: patient.id,
				scheduleId: schedule.id,
				doctorId: schedule.doctor.id,
			},
		});

		const bakashIdToken = await getBkashIdToken();

		if (!bakashIdToken) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Bkash Id Token Not Found",
			);
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
					Date: new Date().toUTCString(),
				},
				body: JSON.stringify({
					mode: "0012",
					payerReference: user.email,
					callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
					amount: amount,
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
				amount: amount,
				getwayResponse: bkashCardPaymentResult,
				bkashPaymentId: bkashCardPaymentResult.paymentID,
				payerReference: user.email,
			},
		});

		// console.log("bkashCardPaymentResult", bkashCardPaymentResult);

		return {
			appointmentId: appointment.id,
			paymentUrl: bkashCardPaymentResult.bkashURL,
		};
	});
	return transactionResult;
};

const payAppointment = async (payload: any, user: RequestUser) => {
	const appointmentId = payload.appointmentId;
	if (typeof appointmentId !== "string" || !appointmentId.trim()) {
		throw new AppError(httpStatus.BAD_REQUEST, "appointmentId is required");
	}

	// const amount = payload.amount || "590";
	const existingAppointment = await prisma.$transaction(async (tx) => {
		const appointment = await tx.appointment.upsert({
			where: { id: appointmentId },
			update: {},
			create: {
				id: appointmentId,
				status: AppointmentStatus.PENDING,
			},
			include: {
				schedule: {
					include: {
						doctor: true,
					},
				},
			},
		});

		if (appointment.status !== AppointmentStatus.PENDING) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Appointment is not in pending status",
			);
		}

		await tx.payment.upsert({
			where: { appointmentId },
			update: {
				amount,
				payerReference: user.email,
			},
			create: {
				appointmentId,
				merchantInvoiceNumber: appointmentId,
				amount,
				payerReference: user.email,
			},
		});

		return appointment;
	});

	// if (existingAppointment.status === "CANCELLED" || existingAppointment.status === "ONGOING" || existingAppointment.status === "COMPLETED") {
	// 	const appointmentStatus = existingAppointment.status
	// 	throw new Error(`Appointment is ${appointmentStatus.toLocaleLowerCase()}`)
	// }

	if (!existingAppointment.schedule) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Appointment schedule is not set",
		);
	}
	if (!existingAppointment.schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor consultation fee is not set",
		);
	}
	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bakashIdToken = await getBkashIdToken();
	if (!bakashIdToken) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			"Bkash Id Token Not Found",
		);
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
				amount: amount,
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: existingAppointment.id,
			}),
		},
	);

	const bkashCardPaymentResult = await bkashCardPaymentResponse.json();

	// payment modle create
	await prisma.payment.update({
		where: {
			appointmentId: existingAppointment.id,
		},
		data: {
			merchantInvoiceNumber: bkashCardPaymentResult.merchantInvoiceNumber,
			getwayResponse: bkashCardPaymentResult,
			bkashPaymentId: bkashCardPaymentResult.paymentID,
		},
	});

	return {
		appointmentId: existingAppointment.id,
		paymentUrl: bkashCardPaymentResult.bkashURL,
	};
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const paymentID = query.paymentID;

		if (!paymentID) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"paymentId messing in query params",
			);
		}

		// bKash sends status as lowercase in query params
		const status = query.status || query.Status;

		if (!status) {
			console.log("Query params received:", query);
			throw new AppError(httpStatus.BAD_REQUEST, "payment status is messing");
		}

		let executePaymentResult;

		// Only call execute API if status is success
		if (status.toLowerCase() === "success") {
			const bkashIdToken = await getBkashIdToken();
			if (!bkashIdToken) {
				throw new AppError(
					httpStatus.INTERNAL_SERVER_ERROR,
					"Bkash Id Token Not Found",
				);
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
						Date: new Date().toUTCString(),
					},
					body: JSON.stringify({
						paymentID: paymentID,
					}),
				},
			);

			executePaymentResult = await executePaymentResponse.json();
		}

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
			console.log("executePaymentResult SUCCESS", executePaymentResult);
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
			};
		} else if (status.toLowerCase() === "failure") {
			try {
				await tx.payment.update({
					where: {
						bkashPaymentId: paymentID,
					},
					data: {
						status: PaymentStatus.FAILED,
						getwayResponse: { status: "failure", ...query },
					},
				});
				console.log("Payment FAILED - Database updated", query);
			} catch (error) {
				console.error("Failed to update payment status:", error);
				console.log("Looking for payment with bkashPaymentId:", paymentID);
			}
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
			};
		} else if (status.toLowerCase() === "cancel") {
			try {
				await tx.payment.update({
					where: {
						bkashPaymentId: paymentID,
					},
					data: {
						status: PaymentStatus.CANCELED,
						getwayResponse: { status: "cancel", ...query },
					},
				});
				console.log("Payment CANCELED - Database updated", query);
			} catch (error) {
				console.error("Failed to update payment status:", error);
				console.log("Looking for payment with bkashPaymentId:", paymentID);
			}
			return {
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
			};
		} else {
			console.log("Payment OTHER STATUS:", status, query);
			try {
				await tx.payment.update({
					where: {
						bkashPaymentId: paymentID,
					},
					data: {
						status: PaymentStatus.FAILED,
						getwayResponse: { status: status, ...query },
					},
				});
			} catch (error) {
				console.error(
					"Failed to update payment status for other status:",
					error,
				);
			}
			return {
				query,
				redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
			};
		}
	});
	return transactionResult;
};

const cancelAppointment = async (payload: any) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;
		console.log("cancelAppointment called with appointmentId:", appointmentId);
		console.log("Full payload:", payload);

		const existingAppointment = await tx.appointment.findUnique({
			where: {
				id: appointmentId,
			},
			include: {
				payment: true,
			},
		});

		if (!existingAppointment) {
			console.log("Appointment not found in database for id:", appointmentId);
			throw new AppError(httpStatus.NOT_FOUND, "Appointment does not exist");
		}

		if (
			existingAppointment.status === AppointmentStatus.ONGOING ||
			existingAppointment.status === AppointmentStatus.COMPLETED
		) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				`Cannot cancel ${existingAppointment.status.toLowerCase()} appointment`,
			);
		}

		if (existingAppointment.status === AppointmentStatus.CANCELLED) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Appointment is already cancelled",
			);
		}

		const updatedAppointment = await tx.appointment.update({
			where: {
				id: existingAppointment.id,
			},
			data: {
				status: "CANCELLED",
			},
		});

		const bkashIdToken = await getBkashIdToken();
		if (!bkashIdToken) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Bkash Id Token Not Found",
			);
		}

		const bkashRefundResponse = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/refund`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					Authorization: bkashIdToken,
					"X-App-Key": config.bkash_app_key,
					Date: new Date().toUTCString(),
				},
				body: JSON.stringify({
					paymentID: existingAppointment.payment?.bkashPaymentId,
					amount: existingAppointment.payment?.amount.toString(),
					trxID: existingAppointment.payment?.bkashTrxId,
					reason: "patient cancelled the appointment",
					sku: "appointment-cancellation",
				}),
			},
		);

		const bkashRefundResult = await bkashRefundResponse.json();

		console.log(bkashRefundResult, "bkashRefundResult");

		const updatedPayment = await tx.payment.update({
			where: {
				appointmentId: existingAppointment.id,
			},
			data: {
				refundTrxId: bkashRefundResult.refundTrxID,
				refundAt: bkashRefundResult.createdTime,
				refundAmount: bkashRefundResult.amount,
				refundReason: "patient cancelled the appointment",
				status: PaymentStatus.REFUNDED,
				getwayResponse: bkashRefundResult,
			},
		});
		return {
			appointment: updatedAppointment,
			payment: updatedPayment,
		};
	});
	return transactionResult;
};

export const AppointmentService = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
};
