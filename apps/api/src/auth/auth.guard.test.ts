import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthGuard } from './auth.guard';

vi.mock('../common/request-context', () => ({
  currentAuth: vi.fn(),
}));

import { currentAuth } from '../common/request-context';

describe('AuthGuard', () => {
  it('allows the request through when a session is present', () => {
    vi.mocked(currentAuth).mockReturnValue({
      userId: 'user_1',
      locationStaffId: 'staff_1',
      organizationId: 'org_1',
      locationId: 'loc_1',
      role: 'org_owner',
      fullName: 'Jordan Test',
    });
    const guard = new AuthGuard();
    expect(guard.canActivate({} as any)).toBe(true);
  });

  it('throws UnauthorizedException when there is no session', () => {
    vi.mocked(currentAuth).mockReturnValue(null);
    const guard = new AuthGuard();
    expect(() => guard.canActivate({} as any)).toThrow(UnauthorizedException);
  });
});
