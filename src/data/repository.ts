import { validateAsset, validateExamDocument, validateProject } from '../domain/types';
import type { Asset, ExamDocument, Project } from '../domain/types';
import { ExamDatabase } from './database';
import type { WriteAuthority } from './ownership';
import { notifyProjectDeleted } from './projectEvents';
import { MAX_TOTAL_ASSET_BYTES } from '../shared/assets/limits';

export type ProjectBundle = { project: Project; document: ExamDocument; assets: Asset[] };

function validateBundle(bundle: ProjectBundle): void {
  validateProject(bundle.project);
  validateExamDocument(bundle.document);
  if (bundle.document.projectId !== bundle.project.id) throw new Error('Mismatched document');
  for (const asset of bundle.assets) {
    validateAsset(asset);
    if (asset.projectId !== bundle.project.id) throw new Error('Mismatched asset');
  }
}

export class ProjectRepository {
  constructor(private readonly database: ExamDatabase, private readonly authority: WriteAuthority) {}

  async create(bundle: ProjectBundle): Promise<void> {
    validateBundle(bundle);
    await this.authority.run(bundle.project.id, () => this.database.transaction('rw', this.database.projects,
      this.database.documents, this.database.assets, async () => {
        await this.database.projects.add(bundle.project);
        await this.database.documents.add(bundle.document);
        await this.database.assets.bulkAdd(bundle.assets);
      }));
  }

  async get(projectId: string): Promise<ProjectBundle | null> {
    return this.database.transaction('r', this.database.projects,
      this.database.documents, this.database.assets, async () => {
        const project = await this.database.projects.get(projectId);
        if (!project) return null;
        const document = await this.database.documents.get(projectId);
        if (!document) throw new Error('Project document is missing');
        const assets = await this.database.assets.where('projectId').equals(projectId).toArray();
        const bundle = { project, document, assets };
        validateBundle(bundle);
        return bundle;
      });
  }

  async list(): Promise<Project[]> {
    const projects = await this.database.projects.orderBy('updatedAt').reverse().toArray();
    projects.forEach(validateProject);
    return projects;
  }

  async getAsset(projectId: string, assetId: string): Promise<Asset | null> {
    const asset = await this.database.assets.get(assetId);
    if (!asset || asset.projectId !== projectId) return null;
    validateAsset(asset);
    return asset;
  }

  async addAsset(asset: Asset): Promise<void> {
    validateAsset(asset);
    await this.authority.run(asset.projectId, () => this.database.transaction('rw',
      this.database.projects, this.database.assets, async () => {
        const project = await this.database.projects.get(asset.projectId);
        if (!project) throw new Error('Project does not exist');
        validateProject(project);
        const existing = await this.database.assets.where('projectId').equals(asset.projectId).toArray();
        if (existing.reduce((size, item) => size + item.blob.size, asset.blob.size)
          > MAX_TOTAL_ASSET_BYTES) throw new Error('圖片總量超過 30 MiB 限制');
        await this.database.assets.add(asset);
      }));
  }

  async save(bundle: ProjectBundle): Promise<void> {
    validateBundle(bundle);
    await this.authority.run(bundle.project.id, () => this.database.transaction('rw', this.database.projects,
      this.database.documents, this.database.assets, async () => {
        const existing = await this.database.projects.get(bundle.project.id);
        const oldDocument = await this.database.documents.get(bundle.project.id);
        if (!existing || !oldDocument) throw new Error('Project does not exist');
        validateProject(existing);
        validateExamDocument(oldDocument);
        for (const asset of bundle.assets) {
          const stored = await this.database.assets.get(asset.id);
          if (stored && stored.projectId !== bundle.project.id) {
            throw new Error('Asset belongs to another project');
          }
        }
        await this.database.projects.put(bundle.project);
        await this.database.documents.put(bundle.document);
        await this.database.assets.bulkPut(bundle.assets);
      }));
  }

  async delete(projectId: string): Promise<void> {
    await this.authority.run(projectId, () => this.database.transaction('rw', this.database.projects,
      this.database.documents, this.database.assets, async () => {
        const project = await this.database.projects.get(projectId);
        if (!project) return;
        const document = await this.database.documents.get(projectId);
        if (!document) throw new Error('Project document is missing');
        validateProject(project);
        validateExamDocument(document);
        await this.database.assets.where('projectId').equals(projectId).delete();
        await this.database.documents.delete(projectId);
        await this.database.projects.delete(projectId);
      }));
    notifyProjectDeleted(projectId);
  }
}
