import { Link } from 'react-router-dom';

export function ItemLink({
  itemId,
  itemName,
}: {
  itemId: string | null | undefined;
  itemName: string | null | undefined;
}) {
  const label = itemName ?? itemId ?? '—';

  if (!itemId) return <span>{label}</span>;

  return (
    <Link
      to={`/items/${itemId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:underline"
    >
      {label}
    </Link>
  );
}
