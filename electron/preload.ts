import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { TableAuditApi, WorkerProgressEvent } from '../src/shared/types';

const api: TableAuditApi = {
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  loadFile: (filePath, options) =>
    ipcRenderer.invoke('dataset:loadFile', filePath, options),
  loadBuffer: (buffer, fileName, options) =>
    ipcRenderer.invoke('dataset:loadBuffer', buffer, fileName, options),
  reparse: (options) => ipcRenderer.invoke('dataset:reparse', options),
  loadDemo: () => ipcRenderer.invoke('dataset:loadDemo'),
  getRows: (req) => ipcRenderer.invoke('dataset:getRows', req),
  loadSecondFile: (filePath, options) =>
    ipcRenderer.invoke('reconcile:loadSecondFile', filePath, options),
  loadSecondBuffer: (buffer, fileName, options) =>
    ipcRenderer.invoke('reconcile:loadSecondBuffer', buffer, fileName, options),
  reparseSecond: (options) => ipcRenderer.invoke('reconcile:reparseSecond', options),
  reconcile: (req) => ipcRenderer.invoke('reconcile:run', req),
  generateDdl: (options) => ipcRenderer.invoke('ddl:generate', options),
  previewClean: (options) => ipcRenderer.invoke('clean:preview', options),
  exportCleaned: (options, format, targetPath) =>
    ipcRenderer.invoke('export:cleaned', options, format, targetPath),
  exportReport: (format, dialect, targetPath) =>
    ipcRenderer.invoke('export:report', format, dialect, targetPath),
  exportSql: (options, targetPath) =>
    ipcRenderer.invoke('export:sql', options, targetPath),
  onProgress: (callback: (event: WorkerProgressEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: WorkerProgressEvent) => {
      callback(data);
    };
    ipcRenderer.on('worker:progress', listener);
    return () => {
      ipcRenderer.removeListener('worker:progress', listener);
    };
  }
};

contextBridge.exposeInMainWorld('tableAudit', api);
