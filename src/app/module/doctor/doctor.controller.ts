import { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from "./doctor.service";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
	const files = req.files as { [fieldname: string]: Express.Multer.File[] };
	const resume = files?.["resume"]
		? files["resume"][0]
		: files?.["resumeFile"]
			? files["resumeFile"][0]
			: null;
	const additionalFiles = files?.["additionalFiles"] || [];

	// Try to parse data from different possible field names
	const dataField =
		req.body.data ||
		req.body.json ||
		req.body.payload ||
		req.body.parsedPayload;

	if (!dataField) {
		throw new Error("Form data payload is missing");
	}

	const zodValidationResult = ApplyAsDoctorValidationZodSchema.safeParse(
		typeof dataField === "string" ? JSON.parse(dataField) : dataField,
	);

	if (!zodValidationResult.success) {
		throw new Error(zodValidationResult.error.issues[0].message);
	}

	const payload = zodValidationResult.data;

	const result = await DoctorService.applyDoctor(
		payload,
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Applied As Doctor Successfuly",
		data: result,
	});
});

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await DoctorService.verifyDoctorEmail(payload);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified Successfuly",
		data: result,
	});
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await DoctorService.approveDoctor(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Approved Successfuly",
		data: result,
	});
});

const getAllDoctor = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await DoctorService.getAllDoctor(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "All Doctors Fetched Successfuly",
		data: data,
		meta: meta,
	});
});

export const DoctorController = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctor,
};
