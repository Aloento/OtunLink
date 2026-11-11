export function Copyright() {
  const year = new Date().getFullYear();
  const commit = (import.meta.env.VITE_GIT_SHA as string | undefined)?.slice(0, 7) || 'dev';
  return (
    <p className="text-center text-xs text-ink-subtle">
      © {year}{' '}
      <a
        href="https://aloen.to/"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-ink-muted"
      >
        @Aloento
      </a>
      {' · '}
      <a
        href={commit === 'dev' ? undefined : `https://github.com/Aloento/OtunLink/commit/${commit}`}
        target={commit === 'dev' ? undefined : '_blank'}
        rel={commit === 'dev' ? undefined : 'noopener noreferrer'}
        className="font-mono hover:text-ink-muted"
        aria-label={`Build ${commit}`}
      >
        {commit}
      </a>
    </p>
  );
}
