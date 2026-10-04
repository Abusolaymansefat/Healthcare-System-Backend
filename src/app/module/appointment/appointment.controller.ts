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
	const result = await AppointmentService.cancelAppointment(payload);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Appointment cancelled successfully",
		data: result,
	});
});

export const AppointmentController = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
};
