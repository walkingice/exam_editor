import { useEffect, useRef, useState } from 'react';
import { ExamDatabase } from '../data/database';
import { ProjectOwnership } from '../data/ownership';
import { ProjectRepository } from '../data/repository';
import { ProjectHome } from '../features/projects/ProjectHome';
import { ProjectWorkspace } from '../features/projects/ProjectWorkspace';
import { SettingsPage } from '../features/projects/SettingsPage';
import './styles.css';

const ownership = new ProjectOwnership();
const repository = new ProjectRepository(new ExamDatabase(), ownership);

function currentProjectId(): string | null {
  const match = /^#\/projects\/([^/]+)$/.exec(window.location.hash);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

function currentRoute() {
  const projectId = currentProjectId();
  return projectId === null ? (window.location.hash === '#/settings' ? 'settings' : null)
    : `project:${projectId}`;
}

export function App({ projects = repository, writes = ownership }: {
  projects?: ProjectRepository; writes?: ProjectOwnership;
}) {
  const [page, setPage] = useState(currentRoute);
  const route = useRef(page);
  const guard = useRef<(() => Promise<boolean>) | null>(null);
  const attempt = useRef(0);

  useEffect(() => {
    const update = () => {
      const next = currentRoute();
      if (next === route.current) return;
      const currentAttempt = ++attempt.current;
      void (async () => {
        if (route.current?.startsWith('project:') && guard.current && !await guard.current()) {
          if (currentAttempt === attempt.current) {
            window.location.hash = `/projects/${encodeURIComponent(route.current.slice(8))}`;
          }
          return;
        }
        if (currentAttempt !== attempt.current) return;
        route.current = next;
        setPage(next);
      })();
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);

  return page === 'settings' ? <SettingsPage /> : page
    ? <ProjectWorkspace key={page} projectId={page.slice(8)} repository={projects}
      ownership={writes} registerGuard={(callback) => { guard.current = callback; }} />
    : <ProjectHome repository={projects} ownership={writes} />;
}
