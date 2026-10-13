import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { PaymentService } from "./payment.service";

const getMyPayment = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await PaymentService.getMyPayment(req.query, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment fetched successfully",
		data: result,
	});
});

const getAllPayment = catchAsync(async (req: Request, res: Response) => {
	const result = await PaymentService.getAllPayment(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment fetched successfully",
		data: result,
	});
});

const getSinglePayment = catchAsync(async (req: Request, res: Response) => {
	const paymentId = req.params.paymentId as string;
	const user = req.user!;
	const result = await PaymentService.getSinglePayment(paymentId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Payment fetched successfully",
		data: result,
	});
});

export const PaymentController = {
	getMyPayment,
	getAllPayment,
	getSinglePayment,
};
