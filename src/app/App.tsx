import { useEffect, useState } from 'react';
import { ExamDatabase } from '../data/database';
import { ProjectOwnership } from '../data/ownership';
import { ProjectRepository } from '../data/repository';
import { ProjectHome } from '../features/projects/ProjectHome';
import { ProjectWorkspace } from '../features/projects/ProjectWorkspace';

const ownership = new ProjectOwnership();
const repository = new ProjectRepository(new ExamDatabase(), ownership);

function currentProjectId(): string | null {
  const match = /^#\/projects\/([^/]+)$/.exec(window.location.hash);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function App({ projects = repository, writes = ownership }: {
  projects?: ProjectRepository; writes?: ProjectOwnership;
}) {
  const [projectId, setProjectId] = useState(currentProjectId);

  useEffect(() => {
    const update = () => setProjectId(currentProjectId());
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return projectId
    ? <ProjectWorkspace key={projectId} projectId={projectId} repository={projects} ownership={writes} />
    : <ProjectHome repository={projects} ownership={writes} />;
}
