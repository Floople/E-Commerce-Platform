import { Response } from "express";

const API_VERSION = 1;

export interface ApiSuccess<T> {
    apiVersion: typeof API_VERSION;
    data: T;
}

export interface ApiError {
    apiVersion: typeof API_VERSION;
    error: string;
}

export function sendData<T>(res: Response, data: T, status = 200): void {
    res.status(status).json({ apiVersion: API_VERSION, data });
}

export function sendError(res: Response, status: number, message: string): void {
    res.status(status).json({ apiVersion: API_VERSION, error: message });
}
