import httpStatus from "http-status";
import { Request, Response } from "express";
import { sendResponse } from "../../utils/sendResponse";
import { catchAsync } from "../../utils/catchAsync";
import { AnalyticsService } from "./analytics.service";

const getAdminAnalytics = catchAsync(async (req: Request, res: Response) => {
	const result = await AnalyticsService.getAdminAnalytics();
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Analytics fetched successfully",
		data: result,
	});
});

const getPatientAnalytics = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AnalyticsService.getPatientAnalytics(user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Analytics fetched successfully",
		data: result,
	});
});

const getDoctorAnalytics = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;
	const result = await AnalyticsService.getDoctorAnalytics(user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Analytics fetched successfully",
		data: result,
	});
});

export const AnalyticsController = {
	getAdminAnalytics,
	getPatientAnalytics,
	getDoctorAnalytics,
};
