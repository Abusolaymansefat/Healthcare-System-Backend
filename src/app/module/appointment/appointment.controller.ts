import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;
	const result = await AppointmentService.bookAppointment(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment booked successfully",
		data: result,
	});
});

const payAppointment = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;
	const result = await AppointmentService.payAppointment(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment payment fetched successfully",
		data: result,
	});
});

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response) => {
		// console.log(req.query, "req.query");
		const { redirectUrl } = await AppointmentService.bookAppointmentCallback(
			req.query,
		);
		// console.log(req.query, "req.query");
		// console.log({ executePaymentResult }, "callback controller");

		res.redirect(redirectUrl);
		// sendResponse(res, {
		// 	statusCode: httpStatus.OK,
		// 	success: true,
		// 	message: " user Book appointment callback fetched successfully",
		// 	data: bkashappointmentResult
		// });
	},
);
const cancelAppointment = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;
	const result = await AppointmentService.cancelAppointment(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment cancelled successfully",
		data: result,
	});
});

const updateAppointment = catchAsync(async (req: Request, res: Response) => {
	const appointmentId = req.params.appointmentId as string;
	const payload = req.body;
	const user = req.user!;
	const result = await AppointmentService.updateAppointment(
		appointmentId,
		payload,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment updated successfully",
		data: result,
	});
});

const getMyAppointments = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AppointmentService.getMyAppointments(req.query, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "My Appointments fetched successfully",
		data: result,
	});
});

const getDoctorAppointments = catchAsync(
	async (req: Request, res: Response) => {
		const user = req.user!;
		const result = await AppointmentService.getDoctorAppointments(
			req.query,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Appointments fetched successfully",
			data: result,
		});
	},
);

const getAllAppointments = catchAsync(async (req: Request, res: Response) => {
	const result = await AppointmentService.getAllAppointments(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "All Appointments fetched successfully",
		data: result,
	});
});

const getSingleAppointments = catchAsync(
	async (req: Request, res: Response) => {
		const appointmentId = req.params.appointmentId as string;
		const user = req.user!;
		const result = await AppointmentService.getSingleAppointments(
			appointmentId,
			user,
		);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Single Appointment fetched successfully",
			data: result,
		});
	},
);

export const AppointmentController = {
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
