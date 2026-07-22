export const MAX_COMPLIANCE_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'rtf', 'zip',
]);

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/rtf', 'text/rtf', 'application/zip', 'application/x-zip-compressed',
]);

export function isAllowedComplianceFile(filename: string, mimeType: string) {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (!ALLOWED_EXTENSIONS.has(extension)) return false;
  return ALLOWED_MIME_TYPES.has(mimeType.toLowerCase()) || mimeType === '' || mimeType === 'application/octet-stream';
}

export const COMPLIANCE_FILE_HELP = 'PDF, image, Word, Excel, PowerPoint, text, CSV, RTF, or ZIP';
