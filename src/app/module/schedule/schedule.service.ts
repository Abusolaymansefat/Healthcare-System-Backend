import { addDays, differenceInMinutes, startOfDay } from "date-fns";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";
import { ICreateSchedulePayload } from "./schedule.interface";
import httpStatus from "http-status";
import { IQuery } from "../../../interfaces";
import { ScheduleWhereInput } from "../../../generated/prisma/models";

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
			totalSchedules,
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
			totalSchedules,
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
export const SecheduleService = {
	createShedule,
	getMySchedules,
	getAllSchedules,
	getScheduleById,
};
