import {
	addDays,
	differenceInMinutes,
	isAfter,
	isSameDay,
	startOfDay,
} from "date-fns";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";
import {
	ICreateSchedulePayload,
	IUpdateSchedulePayload,
} from "./schedule.interface";
import httpStatus from "http-status";
import { IQuery } from "../../../interfaces";
import { ScheduleWhereInput } from "../../../generated/prisma/models";
import { th } from "zod/locales";
import { ScheduleStatus } from "../../../generated/prisma/enums";

// create schedule
const createShedule = async (
	payload: ICreateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	// check if start time and end time are same day
	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start time and end time must be same day",
		);
	}

	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start time must be before end time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime);
	const startOfNextDay = addDays(startOfTheDay, 1);

	const existingSchedule = await prisma.schedule.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lte: startOfNextDay,
			},
		},
	});

	if (existingSchedule) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You Already Have Schedule For This Day",
		);
	}

	const durationInMinutes = differenceInMinutes(
		payload.startDateTime,
		payload.endDateTime,
	);

	const MINUTES_ALLOCATED_PER_SLOT = 20;

	const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

	const schedule = await prisma.schedule.create({
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					contactNumber: true,
					specialization: true,
				},
			},
		},
	});

	return schedule;
};

// get all schedules
const getMySchedules = async (query: IQuery, user: RequestUser) => {
	let limit = 10;
	if (query.limit) {
		limit = Number(query.limit);
	}

	let page = 1;
	if (query.page) {
		page = Number(query.page);
	}

	let skip = (page - 1) * limit;

	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor profile Not found");
	}

	const andCondition: ScheduleWhereInput[] = [
		{
			doctorId: doctor.id,
		},
		{
			isDeleted: false,
		},
	];

	if (query.status) {
		andCondition.push({
			status: query.status,
		});
	}

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andCondition,
		},

		take: limit,
		skip,
		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	const totalSchedules = await prisma.schedule.count({
		where: { AND: andCondition },
	});

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total: totalSchedules,
			totalPages: Math.ceil(totalSchedules / limit),
		},
	};
};

// get all schedules

const getAllSchedules = async (query: IQuery) => {
	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const andCondition: ScheduleWhereInput[] = [];

	if (query.doctorId) {
		andCondition.push({
			doctorId: query.doctorId,
		});
	}

	if (query.email) {
		andCondition.push({
			doctor: {
				email: query.email,
			},
		});
	}

	if (query.status) {
		andCondition.push({
			status: query.status,
		});
	}

	if (query.searchTerm) {
		andCondition.push({
			doctor: {
				OR: [
					{ name: { contains: query.searchTerm, mode: "insensitive" } },
					{ email: { contains: query.searchTerm, mode: "insensitive" } },
					{
						specialization: { contains: query.searchTerm, mode: "insensitive" },
					},
				],
			},
		});
	}
	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andCondition,
		},

		take: limit,
		skip,
		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
		include: {
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	const totalSchedules = await prisma.schedule.count({
		where: { AND: andCondition },
	});

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total: totalSchedules,
			totalPages: Math.ceil(totalSchedules / limit),
		},
	};
};

// get schedule id

const getScheduleById = async (scheduleId: string) => {
	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId },
		include: {
			doctor: {
				select: {
					id: true,
					name: true,
					email: true,
					contactNumber: true,
					specialization: true,
					userId: true,
				},
			},
			appointments: {
				include: {
					patient: true,
				},
			},
		},
	});

	if (!schedule) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	return schedule;
};

// updater schedule
const updateSchedule = async (
	scheduleId: string,
	payload: IUpdateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (schedule.doctorId !== doctor.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to update this schuedule",
		);
	}
	if (
		schedule.status === ScheduleStatus.PUBLISHED &&
		schedule.totalSlots !== schedule.availableSlots
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Schuedule once published And Appointments are created cannot be updated",
		);
	}

	// const updateData : IUpdateSchedulePayload = {};
	// if(payload.meetingLink){
	// 	updateData.meetingLink = payload.meetingLink || schedule.meetingLink;
	// }

	payload.meetingLink = payload.meetingLink || schedule.meetingLink;
	payload.startDateTime = payload.startDateTime || schedule.startDateTime;
	payload.endDateTime = payload.endDateTime || schedule.endDateTime;

	if (!isSameDay(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start time and end time must be same day",
		);
	}

	if (isAfter(payload.startDateTime, payload.endDateTime)) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Start time must be before end time",
		);
	}

	const startOfTheDay = startOfDay(payload.startDateTime);
	const startOfNextDay = addDays(startOfTheDay, 1);

	const existingSchedule = await prisma.schedule.findFirst({
		where: {
			doctorId: doctor.id,
			isDeleted: false,
			startDateTime: {
				gte: startOfTheDay,
				lte: startOfNextDay,
			},
		},
	});

	if (existingSchedule) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You Already Have Schedule For This Day",
		);
	}

	const durationInMinutes = differenceInMinutes(
		payload.startDateTime,
		payload.endDateTime,
	);

	const MINUTES_ALLOCATED_PER_SLOT = 20;

	const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

	const updatedSchedule = await prisma.schedule.update({
		where: { id: schedule.id },
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
		include: {
			doctor: {
				select: {
					name: true,
					email: true,
					contactNumber: true,
					specialization: true,
				},
			},
		},
	});

	return updatedSchedule;
};
// publish schedule
const publishSchedule = async (secheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: { id: secheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (schedule.status === ScheduleStatus.PUBLISHED) {
		throw new AppError(httpStatus.FORBIDDEN, "Schedule already published");
	}

	const publishedSchedule = await prisma.schedule.update({
		where: { id: schedule.id },
		data: {
			status: ScheduleStatus.PUBLISHED,
		},
	});

	return publishedSchedule;
};

// delete schedule
const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
	}

	if (
		schedule.status === ScheduleStatus.PUBLISHED &&
		schedule.totalSlots !== schedule.availableSlots
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Schedule once published And Appointments are created cannot be deleted",
		);
	}

	const deletedSchedule = await prisma.schedule.update({
		where: { id: schedule.id },
		data: {
			isDeleted: true,
			deletedAt: new Date(),
		},
	});

	return deletedSchedule;
};

// get todays schedule
const getToDaysSchedule = async (query: IQuery) => {
	if (!query.doctorId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor id Must be providered In Query",
		);
	}

	const doctor = await prisma.doctor.findUnique({
		where: { id: query.doctorId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor not found");
	}

	const limit = query.limit ? Number(query.limit) : 10;
	const page = query.page ? Number(query.page) : 1;
	const skip = (page - 1) * limit;
	const sortBy = query.sortBy ? query.sortBy : "createdAt";
	const sortOrder = query.sortOrder ? query.sortOrder : "desc";

	const now = new Date();

	const startOfTheDay = startOfDay(now);
	const startOfNextDay = addDays(startOfTheDay, 1);

	const andCondition: ScheduleWhereInput[] = [
		{
			doctorId: query.doctorId,
		},
		{
			isDeleted: false,
		},
		{
			status: ScheduleStatus.PUBLISHED,
		},
		{
			startDateTime: {
				gte: startOfTheDay,
				lte: startOfNextDay,
				gt: now,
			},
		},
		{
			availableSlots: { gt: 0 },
		},
	];

	const schedules = await prisma.schedule.findMany({
		where: {
			AND: andCondition,
		},

		take: limit,
		skip,
		orderBy: {
			// sortBy : sortOrder
			[sortBy]: sortOrder,
		},
	});

	const totalSchedules = await prisma.schedule.count({
		where: { AND: andCondition },
	});

	return {
		data: schedules,
		meta: {
			page,
			limit,
			total: totalSchedules,
			totalPages: Math.ceil(totalSchedules / limit),
		},
	};
};

export const SecheduleService = {
	createShedule,
	getMySchedules,
	getAllSchedules,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
	getToDaysSchedule,
};
