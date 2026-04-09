/**
 * BottomNav.tsx
 * Bottom navigation tab bar
 */

import React from 'react';

interface BottomNavProps {
  activePage: string;
  onPageChange: (page: string) => void;
}

interface NavTabProps {
  label: string;
  icon: string;
  pageId: string;
  isActive: boolean;
  onClick: () => void;
}

const NavTab: React.FC<NavTabProps> = ({ label, icon, isActive, onClick }) => (
  <button
    className={`nav-tab ${isActive ? 'active' : ''}`}
    onClick={onClick}
    title={label}
  >
    <span className="nav-icon">{icon}</span>
    <span className="nav-label">{label}</span>
  </button>
);

export const BottomNav: React.FC<BottomNavProps> = ({ activePage, onPageChange }) => {
  const tabs = [
    { label: 'Dashboard', icon: '📊', pageId: 'dashboard' },
    { label: 'Reports', icon: '📈', pageId: 'reports' },
    { label: 'Settings', icon: '⚙️', pageId: 'settings' },
    { label: 'Notifications', icon: '🔔', pageId: 'notifications' },
    { label: 'Help', icon: '❓', pageId: 'help' },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavTab
          key={tab.pageId}
          label={tab.label}
          icon={tab.icon}
          pageId={tab.pageId}
          isActive={activePage === tab.pageId}
          onClick={() => onPageChange(tab.pageId)}
        />
      ))}
    </nav>
  );
};
