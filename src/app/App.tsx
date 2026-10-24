import { useEffect, useRef, useState } from 'react';
import { ExamDatabase } from '../data/database';
import { ProjectOwnership } from '../data/ownership';
import { ProjectRepository } from '../data/repository';
import { ProjectHome } from '../features/projects/ProjectHome';
import { ProjectWorkspace } from '../features/projects/ProjectWorkspace';
import './styles.css';

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
  const route = useRef(projectId);
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    const update = () => {
      const next = currentProjectId();
      if (next === route.current) return;
      const currentAttempt = ++attempt.current;
      void (async () => {
        if (route.current && guard.current && !await guard.current()) {
          if (currentAttempt === attempt.current) {
            window.location.hash = `/projects/${encodeURIComponent(route.current)}`;
          }
          return;
        }
        if (currentAttempt !== attempt.current) return;
        route.current = next;
        setProjectId(next);
      })();
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return projectId
    ? <ProjectWorkspace key={projectId} projectId={projectId} repository={projects}
      ownership={writes} registerGuard={(callback) => { guard.current = callback; }} />
    : <ProjectHome repository={projects} ownership={writes} />;
}
