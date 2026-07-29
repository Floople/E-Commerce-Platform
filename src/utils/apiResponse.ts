import { Response } from "express";

export interface ApiSuccess<T> {
    data: T;
}

export interface ApiError {
    error: string;
}

export function sendData<T>(res: Response, data: T, status = 200): void {
    res.status(status).json({data});
}

export function sendError(res: Response, status: number, message: string): void {
    res.status(status).json({error: message});
}
