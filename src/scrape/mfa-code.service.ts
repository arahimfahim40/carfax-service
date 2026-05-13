import { Injectable, Logger } from '@nestjs/common';

type Pending = {
  resolve: (code: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
};

@Injectable()
export class MfaCodeService {
  private readonly logger = new Logger(MfaCodeService.name);
  private pending: Pending | null = null;

  waitForCode(timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.pending) {
        this.pending.reject(new Error('Replaced by a newer MFA request'));
        clearTimeout(this.pending.timer);
      }
      const timer = setTimeout(() => {
        if (this.pending && this.pending.timer === timer) {
          this.pending = null;
          reject(new Error('Timed out waiting for MFA code'));
        }
      }, timeoutMs);
      this.pending = { resolve, reject, timer };
      this.logger.log(`Waiting for MFA code (up to ${timeoutMs / 1000}s)`);
    });
  }

  submitCode(code: string): boolean {
    if (!this.pending) return false;
    const { resolve, timer } = this.pending;
    clearTimeout(timer);
    this.pending = null;
    this.logger.log('MFA code received');
    resolve(code);
    return true;
  }
}
