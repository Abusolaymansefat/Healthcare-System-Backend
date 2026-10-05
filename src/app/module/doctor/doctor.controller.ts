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

export const DoctorController = {
	applyAsDoctor,
};
