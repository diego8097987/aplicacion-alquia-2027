interface AlquiaLogoProps {
  compact?: boolean;
  inverted?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function AlquiaLogo({ compact = false, inverted = false, size = 'md' }: AlquiaLogoProps) {
  const imgHeight =
    size === 'lg' ? 'h-20' : size === 'sm' ? 'h-9' : compact ? 'h-9' : 'h-12';

  return (
    <div className={`flex items-center select-none ${compact ? '' : 'w-full'}`}>
      <div
        className={`rounded-xl overflow-hidden bg-white border flex items-center justify-center ${
          compact ? 'px-2.5 py-1' : 'w-full px-3 py-2'
        } ${
          inverted
            ? 'border-[#D4A329]/50 shadow-md'
            : 'border-zinc-200 dark:border-zinc-700 shadow-sm'
        }`}
      >
        <img
          src="/alquia-ticket-logo.svg"
          alt="Mueblería Alquia"
          className={`${imgHeight} w-auto object-contain`}
        />
      </div>
    </div>
  );
}
