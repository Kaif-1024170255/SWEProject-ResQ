import { UserRole } from '../models';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  name?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
