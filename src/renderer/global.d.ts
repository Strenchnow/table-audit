import type { TableAuditApi } from '../shared/types';

declare global {
  interface Window {
    tableAudit: TableAuditApi;
  }
}

export {};
