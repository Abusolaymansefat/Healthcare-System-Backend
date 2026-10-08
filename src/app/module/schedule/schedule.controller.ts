import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { SecheduleService } from "./schedule.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
	// const result = await SecheduleService.createSchedule(req.body);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule created successfully",
		data: {},
	});
});
