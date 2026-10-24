import Dexie, { type Table } from 'dexie';
import { normalizeDocument } from '../domain/document';
import {
  DEFAULT_PAGE_SETTINGS, DOCUMENT_SCHEMA_VERSION,
  type Asset, type ExamDocument, type Project,
} from '../domain/types';

type LegacyProject = Omit<Project, 'pageSettings' | 'schemaVersion'> & {
  pageSettings?: Project['pageSettings']; schemaVersion?: number;
};
type LegacyDocument = Omit<ExamDocument, 'schemaVersion'> & { schemaVersion?: number };

export class ExamDatabase extends Dexie {
  projects!: Table<Project, string>;
  documents!: Table<ExamDocument, string>;
  assets!: Table<Asset, string>;

  constructor(name = 'exam-editor', dependencies?: { indexedDB: IDBFactory; IDBKeyRange: typeof IDBKeyRange }) {
    super(name, dependencies);
    this.version(1).stores({
      projects: 'id, updatedAt',
      documents: 'projectId',
      assets: 'id, projectId',
    });
    this.version(2).stores({
      projects: 'id, updatedAt',
      documents: 'projectId',
      assets: 'id, projectId',
    }).upgrade(async (transaction) => {
      await transaction.table<LegacyProject>('projects').toCollection().modify((project) => {
        if ((project.schemaVersion ?? 0) > DOCUMENT_SCHEMA_VERSION) {
          throw new Error('Unsupported future project version');
        }
        project.pageSettings ??= structuredClone(DEFAULT_PAGE_SETTINGS);
        project.schemaVersion = DOCUMENT_SCHEMA_VERSION;
      });
      await transaction.table<LegacyDocument>('documents').toCollection().modify((document) => {
        if ((document.schemaVersion ?? 0) > DOCUMENT_SCHEMA_VERSION) {
          throw new Error('Unsupported future document version');
        }
        document.content = normalizeDocument(document.content);
        document.schemaVersion = DOCUMENT_SCHEMA_VERSION;
      });
    });
  }
}
