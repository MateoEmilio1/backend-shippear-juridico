import type { NextFunction, Request, RequestHandler, Response } from "express";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const asyncHandler = (
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler => (request, response, next) => {
  Promise.resolve(handler(request, response, next)).catch(next);
};
