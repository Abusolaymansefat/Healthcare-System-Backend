import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { SecheduleService } from "./schedule.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await SecheduleService.createShedule(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule created successfully",
		data: result,
	});
});

const getMySchedules = catchAsync(async (req: Request, res: Response) => {
	const user = req.user!;

	const { data, meta } = await SecheduleService.getMySchedules(req.query, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedules Retrieved Successfully",
		data,
		meta,
	});
});

const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await SecheduleService.getAllSchedules(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedules Retrieved Successfully",
		data,
		meta,
	});
});
const getTodaysSchedules = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await SecheduleService.getToDaysSchedule(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Today's Schedules Retrieved Successfully",
		data,
		meta,
	});
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;

	const result = await SecheduleService.getScheduleById(scheduleId);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Retrieved Successfully",
		data: result,
	});
});

const updateSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const payload = req.body;
	const user = req.user!;

	const result = await SecheduleService.updateSchedule(
		scheduleId,
		payload,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Updated Successfully",
		data: result,
	});
});

const publishSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const user = req.user!;

	const result = await SecheduleService.publishSchedule(scheduleId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Published Successfully",
		data: result,
	});
});

const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
	const scheduleId = req.params.scheduleId as string;
	const user = req.user!;

	const result = await SecheduleService.deleteSchedule(scheduleId, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule Deleted Successfully",
		data: result,
	});
});

export const ScheduleController = {
	createSchedule,
	getMySchedules,
	getAllSchedules,
	getTodaysSchedules,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
};
