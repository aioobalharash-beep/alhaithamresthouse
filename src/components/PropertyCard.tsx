import React from 'react';
import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import { OptimizedImage } from './OptimizedImage';
import { cn } from '@/src/lib/utils';

export interface PropertyCardProps {
  id?: string;
  name: string;
  location?: string;
  imageUrl: string;
  pricePerNight: number;
  currency?: string;
  badge?: string;          // e.g. "Mountain View", "Available"
  available?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Stone & Rose Property Card — vertical, high-aspect ratio, stone-block
 * shadow, dusty-rose availability badge, slow desaturation on hover.
 */
export const PropertyCard: React.FC<PropertyCardProps> = ({
  name,
  location,
  imageUrl,
  pricePerNight,
  currency = 'OMR',
  badge,
  available = true,
  onClick,
  className,
}) => {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      whileHover={{ y: -4 }}
      className={cn(
        'group relative w-full text-start',
        'bg-off-white rounded-[8px] overflow-hidden',
        'shadow-[var(--shadow-stone)]',
        'transition-transform duration-300 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose',
        className
      )}
      style={{ border: '1px solid rgba(47,53,59,0.08)' }}
    >
      {/* Image — vertical aspect, desaturate on hover */}
      <div className="relative aspect-[3/4] overflow-hidden bg-slate/10">
        <OptimizedImage
          src={imageUrl}
          alt={name}
          className={cn(
            'w-full h-full object-cover',
            'transition-[filter,transform] duration-700 ease-out',
            'group-hover:saturate-[0.65] group-hover:scale-[1.03]'
          )}
        />

        {/* Rose badge */}
        {badge && (
          <span
            className={cn(
              'absolute top-3 start-3',
              'px-3 py-1 rounded-[8px]',
              'bg-rose text-obsidian',
              'font-body text-[10px] font-bold uppercase tracking-[0.2em]',
              'shadow-[var(--shadow-stone-sm)]'
            )}
          >
            {badge}
          </span>
        )}

        {/* Subtle slate-to-transparent veil for legibility */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate/70 to-transparent"
        />
      </div>

      {/* Body */}
      <div className="p-5 space-y-2">
        <h3 className="font-headline text-obsidian text-base md:text-lg font-semibold uppercase tracking-[0.18em] leading-tight">
          {name}
        </h3>

        {location && (
          <div className="flex items-center gap-1.5 text-obsidian/60">
            <MapPin size={13} className="text-rose shrink-0" />
            <span className="font-body text-xs tracking-wide truncate">{location}</span>
          </div>
        )}

        <div className="flex items-baseline justify-between pt-2 border-t border-slate/10">
          <div className="font-body text-[10px] uppercase tracking-[0.25em] text-obsidian/50">
            From
          </div>
          <div className="font-headline text-lg font-bold text-juniper tracking-wider">
            {pricePerNight}{' '}
            <span className="text-[10px] font-body font-semibold tracking-[0.25em] text-obsidian/60 uppercase">
              {currency} / night
            </span>
          </div>
        </div>

        {!available && (
          <div className="text-[10px] uppercase tracking-[0.25em] text-rose font-bold pt-1">
            Currently unavailable
          </div>
        )}
      </div>
    </motion.button>
  );
};

export default PropertyCard;
