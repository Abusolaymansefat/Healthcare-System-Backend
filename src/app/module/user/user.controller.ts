import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { UserService } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
	if (!req.file) {
		throw new Error("No file uploaded");
	}

	const userId = req.user?.userId;

	const result = await UserService.uplodeProfile(req.file?.buffer, userId!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "verification email sent successfully",
		data: result,
	});
});

export const UserController = {
	uploadProfileImage,
};
