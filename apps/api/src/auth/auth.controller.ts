import { Body, Controller, Get, Post, Res, UnauthorizedException } from '@nestjs/common';
import type { Response } from 'express';
import { currentAuth } from '../common/request-context';
import { signSessionToken, SESSION_COOKIE_NAME } from './jwt';
import { listLoginRoster, lookupStaffForLogin } from './roster-bootstrap';
import type { AuthClaims } from './auth.types';
import type { StaffRole } from '../db/kysely.types';

@Controller('auth')
export class AuthController {
  /** Populates the dev "log in as" picker. See roster-bootstrap.ts for why this is the one pre-auth query. */
  @Get('roster')
  async roster() {
    return listLoginRoster();
  }

  @Post('login')
  async login(@Body('locationStaffId') locationStaffId: string, @Res({ passthrough: true }) res: Response) {
    if (!locationStaffId) {
      throw new UnauthorizedException('locationStaffId is required');
    }
    const staff = await lookupStaffForLogin(locationStaffId);
    if (!staff) {
      throw new UnauthorizedException('Unknown staff member');
    }

    const claims: AuthClaims = {
      userId: staff.userId,
      locationStaffId: staff.locationStaffId,
      organizationId: staff.organizationId,
      locationId: staff.locationId,
      role: staff.role as StaffRole,
      fullName: staff.fullName,
    };

    const token = signSessionToken(claims);
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    });

    return claims;
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME);
    return { ok: true };
  }

  @Get('me')
  me() {
    return currentAuth();
  }
}
