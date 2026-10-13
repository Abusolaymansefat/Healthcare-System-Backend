import app from "../../../app";
import {
	AppointmentStatus,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";
import httpStatus from "http-status";
import {
	IBookAppointmentPayload,
	ICancelAppointmentPayload,
	IPayAppointmentPayload,
	IUpdateAppointmentStatusPayload,
} from "./appointment.interface";
import { addMinutes, isBefore, isSameDay, subHours } from "date-fns";
import { transporter } from "../../lib/nodemailer";
import PDFDocument from "pdfkit";
import { IQuery } from "../../../interfaces";
import { AppointmentWhereInput } from "../../../generated/prisma/models";
import { date } from "zod";
import { meta } from "zod/v4/core";

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

// pay appointment
const payAppointment = async (
	payload: IPayAppointmentPayload,
	user: RequestUser,
) => {
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

// book appointment callback
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
			const appointment = await prisma.appointment.findUnique({
				where: {
					id: executePaymentResult.merchantInvoiceNumber,
				},
				include: {
					schedule: true,
					patient: true,
					doctor: true,
				},
			});

			if (!appointment) {
				throw new AppError(httpStatus.BAD_REQUEST, "Appointment not found");
			}

			if (!appointment.patient) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Patient not found for this appointment",
				);
			}

			if (!appointment.schedule) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Schedule not found for this appointment",
				);
			}

			const newAvailableSlot = appointment.schedule.availableSlots - 1;

			const alreadyBookedSlots =
				appointment.schedule.totalSlots - appointment.schedule.availableSlots;

			const serialNumber = alreadyBookedSlots + 1;

			const joiningtime = addMinutes(
				appointment.schedule.startDateTime,
				(serialNumber - 1) * 20,
			);

			await tx.appointment.update({
				where: {
					id: executePaymentResult.merchantInvoiceNumber,
				},
				data: {
					status: AppointmentStatus.CONFIRMED,
					joiningTime: joiningtime,
					serialNumber: serialNumber,
				},
			});

			await prisma.schedule.update({
				where: {
					id: appointment.schedule.id,
				},
				data: {
					availableSlots: newAvailableSlot,
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

			const pdfDocument = new PDFDocument({ margin: 50 });

			const pdfChanks: Buffer[] = [];

			pdfDocument.on("data", (chunk: Buffer) => {
				pdfChanks.push(chunk);
			});

			const pdfReadyPromise = new Promise<Buffer>((resolve) => {
				pdfDocument.on("end", () => {
					resolve(Buffer.concat(pdfChanks));
				});
			});

			pdfDocument
				.fontSize(20)
				.text("PH Health Care System", { align: "center" });
			pdfDocument.fontSize(15).text("Appointment Invoice", { align: "center" });
			pdfDocument.moveDown(2);

			pdfDocument
				.fontSize(12)
				.text(`patient name: ${appointment.patient?.name}`);
			pdfDocument.text(`patient email: ${appointment.patient?.email}`);
			pdfDocument.moveDown(2);

			pdfDocument.fontSize(12).text(`doctor name: ${appointment.doctor?.name}`);
			pdfDocument.text(`doctor email: ${appointment.doctor?.specialization}`);
			pdfDocument.moveDown(2);

			// pdf document text
			pdfDocument.text(
				`Appointment Date: ${appointment.schedule.startDateTime.toDateString()}`,
			);
			pdfDocument.text(`Your joining Time: ${joiningtime.toDateString()}`);
			pdfDocument.text(`Your Serial Number: ${serialNumber}`);
			pdfDocument.text(
				`Your Meeting Link: ${appointment.schedule.meetingLink}`,
			);
			pdfDocument.moveDown(2);

			// payment details
			pdfDocument.text(`Amount Paid : ${executePaymentResult.amount} BDT`);
			pdfDocument.text(`payment method: ${executePaymentResult.paymentMethod}`);
			pdfDocument.text(`transaction id: ${executePaymentResult.trxID}`);
			pdfDocument.text(`paid At: ${executePaymentResult.paymentExecuteTime}`);

			pdfDocument.end();

			const pdfBuffer = await pdfReadyPromise;

			await transporter.sendMail({
				from: config.smtp_user,
				to: appointment.patient.email,
				subject: "Your Appointment Booked Successfully",
				text: "Thank you for booking an appointment with us. We look forward to seeing you soon!",
				attachments: [
					{
						filename: "invoice.pdf",
						content: pdfBuffer,
					},
				],
			});
			// console.log("executePaymentResult SUCCESS", executePaymentResult);
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

// cancel appointment
const cancelAppointment = async (
	payload: ICancelAppointmentPayload,
	user: RequestUser,
) => {
	const transactionResult = await prisma.$transaction(async (tx) => {
		const appointmentId = payload.appointmentId;
		// console.log("cancelAppointment called with appointmentId:", appointmentId);
		// console.log("Full payload:", payload);

		const existingAppointment = await tx.appointment.findUnique({
			where: {
				id: appointmentId,
				patient: {
					email: user.email,
				},
			},
			include: {
				payment: true,
				schedule: true,
			},
		});

		if (!existingAppointment) {
			console.log("Appointment not found in database for id:", appointmentId);
			throw new AppError(httpStatus.NOT_FOUND, "Appointment does not exist");
		}

		if (!existingAppointment.schedule) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Appointment schedule is not set",
			);
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
				status: AppointmentStatus.CANCELLED,
			},
		});

		await tx.schedule.update({
			where: {
				id: existingAppointment.schedule.id,
			},
			data: {
				availableSlots: { increment: 1 },
			},
		});

		const now = new Date();
		const startDateTime = existingAppointment.schedule.startDateTime;

		const refundCutOffTime = subHours(startDateTime, 1);
		const isEligibleForRefund = isBefore(now, refundCutOffTime);

		if (isEligibleForRefund) {
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

			await tx.payment.update({
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
		}

		const newPaymentInfo = await prisma.payment.findUnique({
			where: {
				appointmentId: existingAppointment.id,
			},
		});

		return {
			appointment: updatedAppointment,
			payment: newPaymentInfo,
		};
	});
	return transactionResult;
};

// Doctor only
const updateAppointment = async (
	appointmentId: string,
	payload: IUpdateAppointmentStatusPayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	if (appointment.status === AppointmentStatus.COMPLETED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot update completed appointment",
		);
	}

	if (appointment.status === AppointmentStatus.CANCELLED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot update cancelled appointment",
		);
	}
	if (appointment.status === AppointmentStatus.PENDING) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Cannot update pending appointment",
		);
	}

	if (
		appointment.status === AppointmentStatus.CONFIRMED &&
		payload.status === AppointmentStatus.ONGOING
	) {
		return prisma.appointment.update({
			where: { id: appointment.id },
			data: {
				status: AppointmentStatus.ONGOING,
			},
		});
	}

	if (
		appointment.status === AppointmentStatus.ONGOING &&
		payload.status === AppointmentStatus.COMPLETED
	) {
		return prisma.appointment.update({
			where: { id: appointment.id },
			data: {
				status: AppointmentStatus.COMPLETED,
			},
		});
	}

	const updatedAppointment = await prisma.appointment.update({
		where: { id: appointment.id },
		data: {
			status: payload.status,
		},
	});

	return updatedAppointment;

	// throw new AppError(httpStatus.BAD_REQUEST, "Invalid appointment status transition")
};

// patient Appointment
const getMyAppointments = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient not found");
	}

	const andCondition: AppointmentWhereInput[] = [
		{
			patientId: patient.id,
		},
	];

	if (query.status) {
		andCondition.push({
			status: query.status,
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andCondition },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andCondition },
	});
	return {
		data: appointments,
		meta: {
			total,
			limit,
			page,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// doctor Appointment
const getDoctorAppointments = async (query: IQuery, user: RequestUser) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const andCondition: AppointmentWhereInput[] = [
		{
			doctorId: doctor.id,
		},
	];

	if (query.status) {
		andCondition.push({
			status: query.status,
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andCondition },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			patient: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andCondition },
	});
	return {
		data: appointments,
		meta: {
			total,
			limit,
			page,
			totalPages: Math.ceil(total / limit),
		},
	};
};
// all appointments
const getAllAppointments = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andCondition: AppointmentWhereInput[] = [];

	if (query.status) {
		andCondition.push({
			status: query.status,
		});
	}

	if (query.doctorId) {
		andCondition.push({
			doctorId: query.doctorId,
		});
	}

	if (query.patientId) {
		andCondition.push({
			patientId: query.patientId,
		});
	}

	if (query.doctorEmail) {
		andCondition.push({
			doctor: {
				email: query.doctorEmail,
			},
		});
	}

	if (query.patientEmail) {
		andCondition.push({
			patient: {
				email: query.patientEmail,
			},
		});
	}

	const appointments = await prisma.appointment.findMany({
		where: { AND: andCondition },
		take: limit,
		skip,
		orderBy: { [sortBy]: sortOrder },
		include: {
			patient: { select: { id: true, name: true, email: true } },
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: true,
		},
	});

	const total = await prisma.appointment.count({
		where: { AND: andCondition },
	});
	return {
		data: appointments,
		meta: {
			total,
			limit,
			page,
			totalPages: Math.ceil(total / limit),
		},
	};
};

// single appointment
const getSingleAppointments = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.appointment.findUnique({
		where: { id: appointmentId },
		include: {
			patient: {
				select: {
					id: true,
					name: true,
					email: true,
					contactNumber: true,
					userId: true,
				},
			},
			doctor: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: true,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment not found");
	}

	if (user.role === Role.PATIENT) {
		if (appointment.patient?.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not authorized to view this appointment",
			);
		}
	}

	if (user.role === Role.DOCTOR) {
		if (appointment.doctor?.userId !== user.userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not authorized to view this appointment",
			);
		}
	}

	return appointment;
};

export const AppointmentService = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointment,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointments,
};
