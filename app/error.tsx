'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('CareMesh application error'); }, []);
  return <main className="simple-auth-page"><section className="simple-auth-card"><div className="error-icon"><AlertTriangle size={23}/></div><div className="eyebrow">CAREMesh</div><h1>Something went wrong</h1><p>CareMesh could not complete that request. Your data has not been intentionally changed by this error. Try again, and contact your administrator if the problem persists.</p><button className="btn btn-primary" onClick={() => reset()}><RefreshCw size={15}/>Try again</button></section></main>;
}
