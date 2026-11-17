import { useState } from 'react';

interface StudentAvatarProps {
  name: string;
  photoDataUrl: string | null;
  sizeClass?: string;
  textSizeClass?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function StudentAvatar({
  name,
  photoDataUrl,
  sizeClass = 'w-10 h-10',
  textSizeClass = 'text-xs',
}: StudentAvatarProps) {
  const [imgError, setImgError] = useState(false);

  if (photoDataUrl && !imgError) {
    return (
      <img
        src={photoDataUrl}
        alt={`${name} portrait`}
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${sizeClass} rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={`${name} avatar`}
      className={`${sizeClass} ${textSizeClass} rounded-lg bg-slate-200 text-slate-700 font-semibold flex items-center justify-center border border-slate-300/70 shrink-0 select-none`}
    >
      {getInitials(name)}
    </div>
  );
}
