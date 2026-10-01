import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
	const bkashCardPaymentResult = await AppointmentService.bookAppointment();
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: bkashCardPaymentResult,
	});
});

const bookAppointmentCallback = catchAsync(
	async (req: Request, res: Response) => {
		// console.log(req.query, "req.query");
		const { executePaymentResult, redirectUrl } =
			await AppointmentService.bookAppointmentCallback(req.query);
		// console.log(req.query, "req.query");
		console.log({ executePaymentResult }, "callback controller");

		res.redirect(redirectUrl);
		// sendResponse(res, {
		// 	statusCode: httpStatus.OK,
		// 	success: true,
		// 	message: " user Book appointment callback fetched successfully",
		// 	data: bkashappointmentResult
		// });
	},
);

export const AppointmentController = {
	bookAppointment,
	bookAppointmentCallback,
};
