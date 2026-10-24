const channelName = 'exam-project-events';

export function notifyProjectDeleted(projectId: string): void {
  try { window.dispatchEvent(new CustomEvent('exam-project-deleted', { detail: projectId })); }
  catch { /* The committed deletion must still succeed. */ }
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(channelName);
    try { channel.postMessage({ type: 'deleted', projectId }); }
    finally { channel.close(); }
  } catch { /* Other tabs can refresh to observe the deletion. */ }
}

export function onProjectDeleted(projectId: string, callback: () => void): () => void {
  const local = (event: Event) => {
    if ((event as CustomEvent<string>).detail === projectId) callback();
  };
  window.addEventListener('exam-project-deleted', local);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try { channel = new BroadcastChannel(channelName); }
    catch { /* Local deletion notices still work. */ }
  }
  if (channel) channel.onmessage = (event: MessageEvent) => {
    if (event.data?.type === 'deleted' && event.data.projectId === projectId) callback();
  };
  return () => { window.removeEventListener('exam-project-deleted', local); channel?.close(); };
}
