import { describe, expect, it } from 'vitest';
import { isAllowedComplianceFile, MAX_COMPLIANCE_FILE_SIZE } from './compliance-file.rules';

describe('compliance attachment rules', () => {
  it('accepts common business documents and employee license photos', () => {
    expect(isAllowedComplianceFile('license.jpg', 'image/jpeg')).toBe(true);
    expect(isAllowedComplianceFile('certificate.pdf', 'application/pdf')).toBe(true);
    expect(isAllowedComplianceFile('training.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(isAllowedComplianceFile('records.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(isAllowedComplianceFile('archive.zip', 'application/zip')).toBe(true);
  });

  it('rejects executable and active web content even when a browser supplies a MIME type', () => {
    expect(isAllowedComplianceFile('installer.exe', 'application/octet-stream')).toBe(false);
    expect(isAllowedComplianceFile('payload.html', 'text/html')).toBe(false);
    expect(isAllowedComplianceFile('script.svg', 'image/svg+xml')).toBe(false);
  });

  it('allows files up to the documented 25 MB boundary', () => {
    expect(MAX_COMPLIANCE_FILE_SIZE).toBe(25 * 1024 * 1024);
  });
});
