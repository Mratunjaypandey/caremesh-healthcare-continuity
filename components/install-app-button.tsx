'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppButton({ compact = false, menuItem = false }: { compact?: boolean; menuItem?: boolean }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const handle = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    window.addEventListener('beforeinstallprompt', handle);
    return () => window.removeEventListener('beforeinstallprompt', handle);
  }, []);

  if (!deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (menuItem) return <button className="profile-menu-item" onClick={install}><Download size={15}/>Install CareMesh</button>;
  if (compact) return <button className="nav-link nav-link-secondary install-side-link" onClick={install}><Download size={17}/><span>Install app</span></button>;
  return <button className="install-button" onClick={install}><Download size={14}/><span>Install app</span></button>;
}
