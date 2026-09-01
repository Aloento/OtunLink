export function Copyright() {
  const year = new Date().getFullYear();
  return (
    <p className="text-center text-xs text-neutral-400">
      © {year}{' '}
      <a
        href="https://aloen.to/"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-neutral-600"
      >
        @Aloento
      </a>
    </p>
  );
}
