'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar.js';
import { Header } from './Header.js';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal.js';
import { AskGenesis } from '@/components/assistant/AskGenesis.js';
import { ToastProvider } from '@/components/ui/Toast.js';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

export function AppShell({ children }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [aiMode, setAiMode] = useState('LIVE');
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;
    async function checkHealth() {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.ai?.mode) {
            setAiMode(data.ai.mode);
          }
        }
      } catch {}
    }

    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleProjectCreated = (newProject) => {
    setIsModalOpen(false);
    router.refresh();
    router.push(`/projects/${newProject.id}`);
  };

  return (
    <ToastProvider>
      <div className="min-h-screen flex bg-slate-50 text-slate-900 font-sans antialiased">
        {/* Dark Navy Sidebar */}
        <Sidebar />

        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Header onOpenNewProjectModal={() => setIsModalOpen(true)} aiMode={aiMode} />

          {/* Global Resilience Banner */}
          {aiMode !== 'LIVE' && (
            <div className="bg-amber-400 text-slate-950 px-6 py-2.5 text-xs font-medium flex items-center justify-between border-b border-amber-500 shadow-xs">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-slate-950 shrink-0" />
                <span>Advance Genesis Model is at capacity right now. Base Genesis Model is handling your request. Results are labeled and can be re-verified with the Advance model later.</span>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-bold bg-amber-500/50 px-2 py-0.5 rounded border border-amber-600/30">
                Base Model Active
              </span>
            </div>
          )}

          <main className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">
              {children}
            </div>
          </main>
        </div>

        {/* Global Quick Project Creation Modal */}
        <CreateProjectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onCreated={handleProjectCreated}
        />

        {/* Global Ask GENESIS Floating Assistant */}
        <AskGenesis />
      </div>
    </ToastProvider>
  );
}

