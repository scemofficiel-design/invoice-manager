export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Ressource') => new AppError(404, 'NOT_FOUND', `${what} introuvable`);
export const forbidden = (msg = 'Action non autorisée') => new AppError(403, 'FORBIDDEN', msg);
export const unauthorized = (msg = 'Authentification requise') => new AppError(401, 'UNAUTHENTICATED', msg);
export const conflict = (code: string, msg: string) => new AppError(409, code, msg);
export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);
