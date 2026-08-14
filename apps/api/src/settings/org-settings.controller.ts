import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { requireOwner } from '../common/request-context';
import { OrgSettingsService, type ApplyScope } from './org-settings.service';

/**
 * Organization-wide operating policy.
 *
 * Owner-only: these defaults reach across every shop, which is precisely what
 * a location manager is not allowed to do (see ARCHITECTURE §Part 2 — a
 * manager is scoped to the locations they manage).
 */
@Controller('org/settings')
@UseGuards(AuthGuard)
export class OrgSettingsController {
  constructor(private readonly settings: OrgSettingsService) {}

  @Get()
  get() {
    const auth = requireOwner();
    return this.settings.get(auth.organizationId);
  }

  /**
   * One field per request. See the service for why a whole-row save is the
   * wrong shape here.
   */
  @Put()
  update(@Body() body: { key?: string; value?: unknown; scope?: ApplyScope }) {
    const auth = requireOwner();
    return this.settings.update(auth.organizationId, String(body?.key ?? ''), body?.value, body?.scope ?? 'future');
  }
}
