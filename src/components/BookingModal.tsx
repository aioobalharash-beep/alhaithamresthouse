import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface BookingModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  /** Optional footer (typically the primary CTA). */
  footer?: React.ReactNode;
}

/**
 * Stone & Rose Booking Modal — a 'Mist' overlay (backdrop blur + slight
 * grayscale) over a chiseled, stone-textured panel.
 */
export const BookingModal: React.FC<BookingModalProps> = ({
  open,
  onClose,
  title = 'Reserve your stay',
  subtitle,
  children,
  footer,
}) => {
  const headingId = useId();

  // Lock body scroll while open + close on Escape
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="booking-modal"
          className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-8"
          aria-modal="true"
          role="dialog"
          aria-labelledby={headingId}
        >
          {/* Mist backdrop — cloud passing over the mountain */}
          <motion.button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute inset-0 mist-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />

          {/* Stone panel */}
          <motion.div
            className={cn(
              'texture-stone relative w-full max-w-lg',
              'bg-slate text-off-white',
              'rounded-[8px] overflow-hidden',
              'shadow-[var(--shadow-stone)]'
            )}
            style={{ border: '1px solid rgba(180,142,146,0.25)' }}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-rose/20">
              <div className="space-y-1">
                <div className="text-rose font-body text-[10px] font-bold uppercase tracking-[0.3em]">
                  Stone &amp; Rose
                </div>
                <h2
                  id={headingId}
                  className="font-headline text-xl md:text-2xl font-semibold text-off-white uppercase tracking-[0.22em]"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="font-body text-sm text-off-white/70 tracking-wide">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close booking"
                className="shrink-0 p-2 rounded-[8px] text-off-white/70 hover:text-rose hover:bg-white/5 transition-colors active:scale-95"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="px-6 py-5 max-h-[65vh] overflow-y-auto font-body text-sm text-off-white/90 space-y-4">
              {children}
            </div>

            {/* Footer */}
            {footer && (
              <div className="px-6 py-4 bg-black/20 border-t border-rose/15">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default BookingModal;
