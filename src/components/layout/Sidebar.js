'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn.js';
import {
  LayoutDashboard,
  FolderGit2,
  PlusCircle,
  ShieldCheck,
  Cpu,
  Database,
  HardDrive,
  FileSearch,
  ExternalLink,
} from 'lucide-react';

const navigationItems = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Projects', href: '/projects', icon: FolderGit2 },
  { name: 'New Project', href: '/projects/new', icon: PlusCircle },
  { name: 'Integrity Guidelines', href: '/integrity', icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-[#0b1329] border-r border-[#1e2947] flex flex-col shrink-0 min-h-screen text-slate-300 select-none">
      {/* Brand Header */}
      <div className="h-16 px-5 flex items-center gap-3 border-b border-[#1e2947]/80 bg-[#070b14]/40">
        <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white shadow-sm ring-1 ring-blue-400/30">
          <FileSearch className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-sm tracking-wider text-white">GENESIS</span>
          <span className="text-[10px] text-slate-400 font-mono tracking-tight">Traceability AI</span>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
          Platform
        </div>

        {navigationItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href) && item.href !== '/projects/new');
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-md text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600/20 text-blue-400 font-semibold border-l-2 border-blue-500 rounded-l-none pl-2.5'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-[#141e3d]'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-400' : 'text-slate-400')} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </div>

      {/* System Status & Integrity Badge */}
      <div className="p-3 border-t border-[#1e2947] bg-[#070b14]/30 space-y-2">
        <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase flex items-center justify-between">
          <span>System Status</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        </div>

        <div className="bg-[#101935] rounded-md p-2.5 border border-[#1e2a4a] space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3 h-3 text-emerald-400" />
              SQLite WAL
            </span>
            <span className="text-emerald-400 font-mono text-[10px]">Active</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <HardDrive className="w-3 h-3 text-blue-400" />
              Storage Provider
            </span>
            <span className="text-slate-300 font-mono text-[10px]">Local Disk</span>
          </div>

          <div className="flex items-center justify-between text-slate-400">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3 h-3 text-purple-400" />
              Advance Model
            </span>
            <span className="text-purple-300 font-mono text-[10px]">Advance Genesis Model</span>
          </div>
        </div>

        <div className="px-2 pt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Academic MVP</span>
          <span>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}

