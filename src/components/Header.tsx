import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { LanguageToggle } from './LanguageToggle';
import { cn } from '@/src/lib/utils';

export interface PropertyOption {
  id: string;
  name: string;
}

interface HeaderProps {
  properties?: PropertyOption[];
  activePropertyId?: string;
  onSelectProperty?: (id: string) => void;
}

/**
 * Stone & Rose Header — chiseled, stone-carved branding with a recessed
 * multi-property groove and a juniper-green active highlight.
 */
export const Header: React.FC<HeaderProps> = ({
  properties,
  activePropertyId,
  onSelectProperty,
}) => {
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const { t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header
      className={cn(
        'texture-stone fixed top-0 inset-x-0 z-50',
        'bg-slate text-off-white',
        'h-16 md:h-20 px-6 md:px-10',
        'flex items-center justify-between gap-4',
        'shadow-[0_10px_25px_rgba(0,0,0,0.25)]'
      )}
      style={{ borderBottom: '1px solid rgba(180,142,146,0.18)' }}
    >
      {/* Brand */}
      <Link
        to="/"
        className="font-headline text-off-white text-lg md:text-2xl font-semibold uppercase tracking-[0.35em] hover:text-rose transition-colors"
        aria-label="Stone & Rose"
      >
        Stone <span className="text-rose">&amp;</span> Rose
      </Link>

      {/* Multi-Property Toggle — recessed groove */}
      {properties && properties.length > 1 && (
        <div
          role="tablist"
          aria-label="Select property"
          className="groove-recessed hidden md:flex items-center gap-1 p-1 rounded-[8px]"
        >
          {properties.map((p) => {
            const active = p.id === activePropertyId;
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectProperty?.(p.id)}
                className={cn(
                  'px-4 py-2 text-[11px] font-body font-semibold uppercase tracking-[0.2em]',
                  'rounded-[6px] transition-all duration-300 active:scale-95',
                  active
                    ? 'bg-juniper text-off-white shadow-[var(--shadow-rose-glow)]'
                    : 'text-off-white/60 hover:text-rose'
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-3">
        <LanguageToggle />

        {isAdmin && (
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="p-2 rounded-[8px] text-off-white/60 hover:text-rose hover:bg-white/5 transition-colors active:scale-95"
            title={t('nav.adminPortal')}
            aria-label={t('nav.adminPortal')}
          >
            <ShieldCheck size={20} />
          </button>
        )}

        {user ? (
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-[8px] text-off-white/80 hover:text-rose hover:bg-white/5 transition-colors text-[11px] font-bold uppercase tracking-[0.2em] active:scale-95"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline">{t('nav.logout')}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-[8px] bg-juniper text-off-white text-[11px] font-bold uppercase tracking-[0.2em] hover:shadow-[var(--shadow-rose-glow)] transition-shadow active:scale-95"
          >
            <LogIn size={18} />
            <span className="hidden sm:inline">{t('nav.login')}</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
