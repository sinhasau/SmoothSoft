import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { currentAuth } from '../common/request-context';

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (!currentAuth()) {
      throw new UnauthorizedException('Not logged in');
    }
    return true;
  }
}
