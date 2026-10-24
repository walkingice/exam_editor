const prefix = 'exam-import-warnings:';

export function storeImportWarnings(projectId: string, warnings: string[]): void {
  try { sessionStorage.setItem(`${prefix}${projectId}`, JSON.stringify(warnings)); }
  catch { /* The project remains available if session storage is full. */ }
}

export function readImportWarnings(projectId: string): string[] {
  try {
    const value = JSON.parse(sessionStorage.getItem(`${prefix}${projectId}`) ?? '[]');
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  } catch { return []; }
}
